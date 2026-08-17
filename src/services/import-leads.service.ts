import { veltzy } from '@/lib/supabase'
import type { LeadTemperature, PipelineStage, LeadSourceRecord, Pipeline, Profile, DealStatus } from '@/types/database'
import type { LeadField } from '@/lib/csv-parser'
import { normalizePhoneBR } from '@/lib/phone'
import { resolveWhatsAppInstance } from '@/services/leads.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ImportableRow {
  name?: string
  phone: string
  email?: string
  source_id?: string
  pipeline_id?: string
  stage_id: string
  temperature?: LeadTemperature
  deal_value?: number
  assigned_to?: string
  observations?: string
  tags?: string[]
}

export interface RowResult {
  rowIndex: number
  status: 'success' | 'error' | 'skipped'
  reason?: string
}

export interface ImportBatchResult {
  results: RowResult[]
  inserted: number
  skipped: number
  errors: number
}

export interface Lookups {
  stages: PipelineStage[]
  sources: LeadSourceRecord[]
  pipelines: Pipeline[]
  members: Profile[]
}

const TEMP_MAP: Record<string, LeadTemperature> = {
  'frio': 'cold', 'cold': 'cold',
  'morno': 'warm', 'warm': 'warm',
  'quente': 'hot', 'hot': 'hot',
  'pegando fogo': 'fire', 'fire': 'fire',
}

const parseBrNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined
  const cleaned = value.replace(/\./g, '').replace(',', '.').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? undefined : num
}

const normalizeText = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

const normalizePhone = normalizePhoneBR

export const mapCsvRowToLead = (
  row: string[],
  columnMapping: Record<number, LeadField | null>,
  defaultPipelineId: string,
  defaultStageId: string,
  defaultSourceId: string | undefined,
  lookups: Lookups,
): ImportableRow => {
  const lead: Partial<ImportableRow> = {
    pipeline_id: defaultPipelineId,
    stage_id: defaultStageId,
    source_id: defaultSourceId,
  }

  for (const [colIndex, field] of Object.entries(columnMapping)) {
    if (!field) continue
    const value = row[Number(colIndex)]?.trim() ?? ''
    if (!value) continue

    switch (field) {
      case 'name':
        lead.name = value
        break
      case 'phone':
        lead.phone = normalizePhone(value)
        break
      case 'email':
        lead.email = value
        break
      case 'stage_id': {
        const normalized = normalizeText(value)
        const pipelineId = lead.pipeline_id ?? defaultPipelineId
        const stage = lookups.stages.find(
          (s) => normalizeText(s.name) === normalized && s.pipeline_id === pipelineId
        ) ?? lookups.stages.find((s) => normalizeText(s.name) === normalized)
        if (stage) lead.stage_id = stage.id
        break
      }
      case 'source_id': {
        const normalized = normalizeText(value)
        const source = lookups.sources.find((s) => normalizeText(s.name) === normalized)
        if (source) lead.source_id = source.id
        break
      }
      case 'pipeline_id': {
        const normalized = normalizeText(value)
        const pipeline = lookups.pipelines.find((p) => normalizeText(p.name) === normalized)
        if (pipeline) lead.pipeline_id = pipeline.id
        break
      }
      case 'assigned_to': {
        if (value === '__SKIP_ASSIGNEE__') {
          // Resolução do pre-flight: sem responsável
          break
        }
        if (UUID_RE.test(value)) {
          // Já resolvido pelo pre-flight scan (profiles.id)
          lead.assigned_to = value
          break
        }
        // Fallback: lookup com normalização de acentos
        const normalized = normalizeText(value)
        const memberByName = lookups.members.find((m) => normalizeText(m.name) === normalized)
        if (memberByName) {
          lead.assigned_to = memberByName.id
          break
        }
        const memberByEmail = lookups.members.find((m) => normalizeText(m.email) === normalized)
        if (memberByEmail) lead.assigned_to = memberByEmail.id
        break
      }
      case 'temperature':
        lead.temperature = TEMP_MAP[value.toLowerCase()] ?? undefined
        break
      case 'deal_value':
        lead.deal_value = parseBrNumber(value)
        break
      case 'observations':
        lead.observations = value
        break
      case 'tags':
        lead.tags = value.split(',').map((t) => t.trim()).filter(Boolean)
        break
    }
  }

  return lead as ImportableRow
}

export const validateRow = (row: ImportableRow, index: number): RowResult | null => {
  if (!row.phone || row.phone.length < 8) {
    return { rowIndex: index, status: 'error', reason: 'Telefone obrigatório (min 8 dígitos)' }
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return { rowIndex: index, status: 'error', reason: `Email inválido: ${row.email}` }
  }
  if (row.assigned_to && !UUID_RE.test(row.assigned_to)) {
    return { rowIndex: index, status: 'error', reason: `Responsável inválido ou não encontrado na empresa` }
  }
  if (row.pipeline_id && !UUID_RE.test(row.pipeline_id)) {
    return { rowIndex: index, status: 'error', reason: `Pipeline inválido ou não encontrado na empresa` }
  }
  return null
}

const translateDbError = (message: string): string => {
  if (message.includes('duplicate') || message.includes('unique')) return 'Telefone já cadastrado (duplicata)'
  if (message.includes('assigned_to')) return 'Responsável inválido ou não pertence à empresa'
  if (message.includes('pipeline_id')) return 'Pipeline inválido ou não encontrado'
  if (message.includes('stage_id')) return 'Etapa inválida ou não encontrada'
  if (message.includes('source_id')) return 'Origem inválida ou não encontrada'
  return `Erro no banco: ${message}`
}

const BATCH_SIZE = 50

export const checkDuplicates = async (companyId: string, phones: string[]): Promise<Set<string>> => {
  const { data } = await veltzy()
    .from('leads')
    .select('phone')
    .eq('company_id', companyId)
    .in('phone', phones)
  return new Set((data ?? []).map((d: { phone: string }) => d.phone))
}

// Status do deal espelhando o estagio do lead importado (consistente com o
// backfill 054 e com createLeadWithDeal). Estagio final -> won/lost; senao open.
const resolveDealStatusFromStage = (stageId: string, stages: PipelineStage[]): DealStatus => {
  const stage = stages.find((s) => s.id === stageId)
  if (stage?.is_final) return stage.is_positive ? 'won' : 'lost'
  return 'open'
}

interface InsertedLeadRow {
  id: string
  row: ImportableRow
}

/**
 * Cria deals em lote para os leads recem-importados, espelhando stage/pipeline/
 * valor/dono de cada lead. Best-effort: falha aqui nao reverte a importacao do
 * lead (mesma postura do fluxo WhatsApp), apenas loga.
 */
const createDealsForImportedLeads = async (
  companyId: string,
  inserted: InsertedLeadRow[],
  stages: PipelineStage[],
  nowIso: string,
): Promise<void> => {
  if (inserted.length === 0) return

  const dealRecords = inserted.map(({ id, row }) => {
    const status = resolveDealStatusFromStage(row.stage_id, stages)
    return {
      company_id: companyId,
      lead_id: id,
      name: row.name ? `Negocio - ${row.name}` : 'Negocio',
      value: row.deal_value ?? 0,
      stage_id: row.stage_id,
      pipeline_id: row.pipeline_id,
      assigned_to: row.assigned_to ?? null,
      status,
      closed_at: status === 'won' || status === 'lost' ? nowIso : null,
    }
  })

  const { error } = await veltzy().from('deals').insert(dealRecords)
  if (error) {
    console.error('[import-leads] Falha ao criar deals em lote:', error.message)
  }
}

export const importLeads = async (
  companyId: string,
  rows: ImportableRow[],
  onProgress: (done: number, total: number) => void,
  stages?: PipelineStage[],
): Promise<ImportBatchResult> => {
  const allResults: RowResult[] = []
  let inserted = 0
  let skipped = 0
  let errors = 0
  const nowIso = new Date().toISOString()

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const batchIndices = batch.map((_, idx) => i + idx)

    // Validação
    const validRows: ImportableRow[] = []
    const validIndices: number[] = []
    batch.forEach((row, idx) => {
      const err = validateRow(row, batchIndices[idx])
      if (err) {
        allResults.push(err)
        errors++
      } else {
        validRows.push(row)
        validIndices.push(batchIndices[idx])
      }
    })

    if (validRows.length === 0) {
      onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length)
      continue
    }

    // Duplicatas
    const phones = validRows.map((r) => r.phone)
    const existing = await checkDuplicates(companyId, phones)

    const toInsert: ImportableRow[] = []
    const toInsertIndices: number[] = []
    validRows.forEach((row, idx) => {
      if (existing.has(row.phone)) {
        allResults.push({ rowIndex: validIndices[idx], status: 'skipped', reason: 'Telefone já cadastrado' })
        skipped++
      } else {
        toInsert.push(row)
        toInsertIndices.push(validIndices[idx])
      }
    })

    if (toInsert.length > 0) {
      // Cache de resolucao de instancia por chave assigned_to|pipeline_id
      const instanceCache = new Map<string, string | null>()
      const resolveInstance = async (assignedTo?: string, pipelineId?: string): Promise<string | null> => {
        const key = `${assignedTo ?? ''}|${pipelineId ?? ''}`
        if (instanceCache.has(key)) return instanceCache.get(key)!
        const result = await resolveWhatsAppInstance(companyId, assignedTo, pipelineId)
        instanceCache.set(key, result)
        return result
      }

      const insertData: Record<string, unknown>[] = []
      for (const row of toInsert) {
        const instanceName = await resolveInstance(row.assigned_to, row.pipeline_id)
        const record: Record<string, unknown> = {
          company_id: companyId,
          name: row.name ?? null,
          phone: row.phone,
          email: row.email ?? null,
          source_id: row.source_id ?? null,
          temperature: row.temperature ?? 'cold',
          observations: row.observations ?? null,
          tags: row.tags ?? [],
        }
        if (row.assigned_to) record.assigned_to = row.assigned_to
        if (instanceName) record.whatsapp_instance_name = instanceName
        insertData.push(record)
      }

      const batchInserted: InsertedLeadRow[] = []

      const { data: insertedRows, error } = await veltzy()
        .from('leads')
        .insert(insertData)
        .select('id')

      if (error) {
        // Batch falhou — tentar row-a-row para identificar quais linhas tem problema
        for (let r = 0; r < insertData.length; r++) {
          const { data: rowData, error: rowError } = await veltzy()
            .from('leads')
            .insert(insertData[r])
            .select('id')
            .single()

          if (rowError) {
            const reason = translateDbError(rowError.message)
            allResults.push({ rowIndex: toInsertIndices[r], status: 'error', reason })
            errors++
          } else {
            allResults.push({ rowIndex: toInsertIndices[r], status: 'success' })
            inserted++
            if (rowData?.id) batchInserted.push({ id: rowData.id, row: toInsert[r] })
          }
        }
      } else {
        toInsertIndices.forEach((idx) => {
          allResults.push({ rowIndex: idx, status: 'success' })
        })
        inserted += toInsertIndices.length
        // Insert preserva a ordem das linhas: insertedRows[k] <-> toInsert[k]
        ;(insertedRows ?? []).forEach((lr, k) => {
          if (lr?.id && toInsert[k]) batchInserted.push({ id: lr.id, row: toInsert[k] })
        })
      }

      // Negocio nasce junto do contato (mesma regra do modal e do WhatsApp)
      await createDealsForImportedLeads(companyId, batchInserted, stages ?? [], nowIso)
    }

    onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length)
  }

  allResults.sort((a, b) => a.rowIndex - b.rowIndex)
  return { results: allResults, inserted, skipped, errors }
}
