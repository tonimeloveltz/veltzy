import { veltzy } from '@/lib/supabase'
import type { DealWithLead, DealStatus, CreateDealInput, UpdateDealInput } from '@/types/database'

const DEAL_WITH_LEAD_SELECT = `
  *,
  leads:lead_id(id, name, phone, email, avatar_url, temperature, tags, is_ai_active, transfer_summary, source_id, company_name, created_at, whatsapp_instance_name,
    lead_sources:source_id(*)
  ),
  pipeline_stages:stage_id(*),
  pipelines:pipeline_id(*)
`

export interface DealFilters {
  pipelineId?: string
  stageId?: string
  status?: string
  assignedTo?: string | null
  search?: string
  limit?: number
  offset?: number
}

const sanitizeSearch = (search: string) =>
  search.replace(/[%_\\]/g, '\\$&')

export const getDealsByCompany = async (companyId: string, filters?: DealFilters): Promise<DealWithLead[]> => {
  const limit = filters?.limit ?? 200
  const offset = filters?.offset ?? 0

  let query = veltzy()
    .from('deals')
    .select(DEAL_WITH_LEAD_SELECT)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (limit > 0) {
    query = query.range(offset, offset + limit - 1)
  }

  if (filters?.pipelineId) {
    query = query.eq('pipeline_id', filters.pipelineId)
  }
  if (filters?.stageId) {
    query = query.eq('stage_id', filters.stageId)
  }
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo)
  }
  if (filters?.search) {
    const sanitized = sanitizeSearch(filters.search)
    query = query.or(`name.ilike.%${sanitized}%,leads.name.ilike.%${sanitized}%,leads.phone.ilike.%${sanitized}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export const getDealsByLead = async (companyId: string, leadId: string): Promise<DealWithLead[]> => {
  const { data, error } = await veltzy()
    .from('deals')
    .select(DEAL_WITH_LEAD_SELECT)
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const getDealsForKanban = async (companyId: string, pipelineId: string): Promise<DealWithLead[]> => {
  const { data, error } = await veltzy()
    .from('deals')
    .select(DEAL_WITH_LEAD_SELECT)
    .eq('company_id', companyId)
    .eq('pipeline_id', pipelineId)
    .in('status', ['open', 'pending_assignment', 'won', 'lost'])
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export const createDeal = async (companyId: string, input: CreateDealInput): Promise<DealWithLead> => {
  const { data, error } = await veltzy()
    .from('deals')
    .insert({ ...input, company_id: companyId })
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

export const updateDeal = async (companyId: string, dealId: string, input: UpdateDealInput): Promise<DealWithLead> => {
  const { data, error } = await veltzy()
    .from('deals')
    .update(input)
    .eq('id', dealId)
    .eq('company_id', companyId)
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

export const deleteDeal = async (companyId: string, dealId: string): Promise<void> => {
  const { error } = await veltzy()
    .from('deals')
    .delete()
    .eq('id', dealId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const moveDealStage = async (
  companyId: string,
  dealId: string,
  stageId: string,
  pipelineId?: string,
  status?: DealStatus,
): Promise<DealWithLead> => {
  const payload: Record<string, unknown> = { stage_id: stageId }
  if (pipelineId) payload.pipeline_id = pipelineId
  if (status) payload.status = status

  const { data, error } = await veltzy()
    .from('deals')
    .update(payload)
    .eq('id', dealId)
    .eq('company_id', companyId)
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

export const updateDealValueAndMove = async (
  companyId: string,
  dealId: string,
  stageId: string,
  value: number,
): Promise<DealWithLead> => {
  const { data, error } = await veltzy()
    .from('deals')
    .update({ stage_id: stageId, value })
    .eq('id', dealId)
    .eq('company_id', companyId)
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

export const closeDeal = async (
  companyId: string,
  dealId: string,
  pipelineId: string,
  outcome: 'won' | 'lost',
): Promise<DealWithLead> => {
  // Buscar stage final do pipeline (is_positive=true para won, false para lost)
  const { data: finalStage } = await veltzy()
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('is_final', true)
    .eq('is_positive', outcome === 'won')
    .limit(1)
    .maybeSingle()

  if (finalStage) {
    // Mover para stage final — trigger popula status + closed_at
    return moveDealStage(companyId, dealId, finalStage.id, undefined, outcome)
  }

  // Fallback: sem stage final definido, setar status + closed_at direto
  const { data, error } = await veltzy()
    .from('deals')
    .update({ status: outcome, closed_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('company_id', companyId)
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

export const assignDeal = async (companyId: string, dealId: string, userId: string): Promise<DealWithLead> => {
  const { data, error } = await veltzy()
    .from('deals')
    .update({ assigned_to: userId, status: 'open' })
    .eq('id', dealId)
    .eq('company_id', companyId)
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

const BATCH_SIZE = 50

const chunk = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

export const bulkUpdateAssignedTo = async (companyId: string, dealIds: string[], targetUserId: string): Promise<void> => {
  const batches = chunk(dealIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('deals')
      .update({ assigned_to: targetUserId })
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }
}

export const bulkArchive = async (companyId: string, dealIds: string[]): Promise<void> => {
  const batches = chunk(dealIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('deals')
      .update({ status: 'archived' as const })
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }
}

export interface BulkUnarchiveResult {
  restored: number
  skippedConflict: number
}

interface UnarchiveCandidate {
  id: string
  lead_id: string | null
  pipeline_id: string | null
  stage_id: string | null
}

interface StageOutcome {
  is_final: boolean
  is_positive: boolean | null
}

/**
 * Universo do conflito, nao lista de destinos. `pending_assignment` deixou de ser
 * status de DESTINO do desarquivamento, mas um `pending_assignment` preexistente
 * (criado pelo inbound) segue ocupando a chave (lead, pipeline) no indice unico
 * `idx_deals_unique_active_per_pipeline`. Estreitar isto para so `open` traz de
 * volta o 23505 que a checagem de conflito existe para evitar.
 */
const ACTIVE_DEAL_STATUSES: DealStatus[] = ['open', 'pending_assignment']

const activeKey = (leadId: string, pipelineId: string) => `${leadId}::${pipelineId}`

/**
 * Status de volta ao desarquivar. Nao existe coluna guardando o status anterior,
 * entao ele e DERIVADO so da etapa. `is_positive` nulo cai em `lost`, igual ao IF
 * do plpgsql do trigger `set_deal_status_on_stage_change` (migration 062).
 *
 * `assigned_to` nao entra na regra: desarquivar nunca devolve o negocio para
 * `pending_assignment`, entao nao coloca card na coluna "Sem dono" do kanban.
 * Sem responsavel volta como `open` mesmo, com o campo em branco.
 */
const resolveUnarchivedStatus = (candidate: UnarchiveCandidate, stages: Map<string, StageOutcome>): DealStatus => {
  const stage = candidate.stage_id ? stages.get(candidate.stage_id) : undefined
  if (stage?.is_final) return stage.is_positive ? 'won' : 'lost'
  return 'open'
}

/**
 * Contraparte de `bulkArchive`. Devolve quantos voltaram e quantos foram pulados
 * por ja existir negocio ativo do mesmo contato no mesmo pipeline
 * (`idx_deals_unique_active_per_pipeline`, migration 065). O conflito e previsto
 * ANTES do UPDATE de proposito: capturar o 23505 depois derrubaria o lote
 * inteiro por causa de uma linha.
 */
export const bulkUnarchive = async (companyId: string, dealIds: string[]): Promise<BulkUnarchiveResult> => {
  const empty: BulkUnarchiveResult = { restored: 0, skippedConflict: 0 }
  if (dealIds.length === 0) return empty

  // 1. Candidatos. O filtro por `archived` torna a funcao idempotente: id que
  // nao esta arquivado e simplesmente ignorado.
  const candidates: UnarchiveCandidate[] = []
  for (const batch of chunk(dealIds, BATCH_SIZE)) {
    const { data, error } = await veltzy()
      .from('deals')
      .select('id, lead_id, pipeline_id, stage_id')
      .in('id', batch)
      .eq('company_id', companyId)
      .eq('status', 'archived')
    if (error) throw error
    candidates.push(...((data ?? []) as UnarchiveCandidate[]))
  }
  if (candidates.length === 0) return empty

  // 2. Etapas dos candidatos, para derivar o status de volta.
  const stageIds = [...new Set(candidates.map((c) => c.stage_id).filter((id): id is string => Boolean(id)))]
  const stages = new Map<string, StageOutcome>()
  for (const batch of chunk(stageIds, BATCH_SIZE)) {
    const { data, error } = await veltzy()
      .from('pipeline_stages')
      .select('id, is_final, is_positive')
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
    for (const stage of (data ?? []) as (StageOutcome & { id: string })[]) {
      stages.set(stage.id, { is_final: stage.is_final, is_positive: stage.is_positive })
    }
  }

  // 3. Status de destino de cada candidato.
  const planned = candidates.map((candidate) => ({ candidate, status: resolveUnarchivedStatus(candidate, stages) }))

  // 4. Chaves lead+pipeline que JA estao ativas. So quem volta como
  // open/pending_assignment entra no indice parcial; won/lost nunca conflita, e
  // pipeline_id nulo tambem nao (o indice trata NULL como distinto).
  const needsCheck = planned.filter(
    (p) => ACTIVE_DEAL_STATUSES.includes(p.status) && p.candidate.lead_id && p.candidate.pipeline_id,
  )

  const activeKeys = new Set<string>()
  const leadsByPipeline = new Map<string, Set<string>>()
  for (const { candidate } of needsCheck) {
    const pipelineId = candidate.pipeline_id as string
    const leads = leadsByPipeline.get(pipelineId) ?? new Set<string>()
    leads.add(candidate.lead_id as string)
    leadsByPipeline.set(pipelineId, leads)
  }

  // Uma consulta por pipeline e por lote de leads. O indice unico garante no
  // maximo 1 deal ativo por (lead, pipeline), entao cada resposta tem no maximo
  // BATCH_SIZE linhas e nunca esbarra no limite de linhas do PostgREST, que
  // truncaria em silencio e faria um conflito passar batido.
  for (const [pipelineId, leadIds] of leadsByPipeline) {
    for (const batch of chunk([...leadIds], BATCH_SIZE)) {
      const { data, error } = await veltzy()
        .from('deals')
        .select('lead_id, pipeline_id')
        .eq('company_id', companyId)
        .eq('pipeline_id', pipelineId)
        .in('lead_id', batch)
        .in('status', ACTIVE_DEAL_STATUSES)
      if (error) throw error
      for (const row of (data ?? []) as { lead_id: string | null; pipeline_id: string | null }[]) {
        if (row.lead_id && row.pipeline_id) activeKeys.add(activeKey(row.lead_id, row.pipeline_id))
      }
    }
  }

  // 5. Separar aprovados por status de destino, pulando os conflitos.
  const idsByStatus = new Map<DealStatus, string[]>()
  let skippedConflict = 0

  for (const { candidate, status } of planned) {
    if (ACTIVE_DEAL_STATUSES.includes(status) && candidate.lead_id && candidate.pipeline_id) {
      const key = activeKey(candidate.lead_id, candidate.pipeline_id)
      if (activeKeys.has(key)) {
        skippedConflict += 1
        continue
      }
      // Reservar a chave resolve o conflito DENTRO do proprio lote: dois
      // arquivados do mesmo contato no mesmo pipeline, so o primeiro volta.
      activeKeys.add(key)
    }
    const ids = idsByStatus.get(status) ?? []
    ids.push(candidate.id)
    idsByStatus.set(status, ids)
  }

  // 6. Gravar por grupo de status.
  let restored = 0
  for (const [status, ids] of idsByStatus) {
    // `closed_at` zera so ao voltar para ativo, igual ao caso "Reabriu" do
    // trigger 062. won/lost preservam a data de fechamento que ja tinham.
    const patch = ACTIVE_DEAL_STATUSES.includes(status) ? { status, closed_at: null } : { status }
    for (const batch of chunk(ids, BATCH_SIZE)) {
      // O `.select('id')` nao e decorativo: `restored` vai para o toast, entao
      // precisa contar o que o banco ACEITOU. Update barrado por RLS nao levanta
      // erro, afeta zero linha e volta calado; contar `batch.length` anunciaria
      // um numero que nao aconteceu.
      const { data, error } = await veltzy()
        .from('deals')
        // `stage_id` fica de fora de proposito: mexer nele dispara o trigger
        // set_deal_status_on_stage_change (062), que sobrescreveria o status
        // calculado aqui.
        .update(patch)
        .in('id', batch)
        .eq('company_id', companyId)
        .select('id')
      if (error) throw error
      restored += data?.length ?? 0
    }
  }

  return { restored, skippedConflict }
}

export const bulkDelete = async (companyId: string, dealIds: string[], userId: string): Promise<void> => {
  const batches = chunk(dealIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('deals')
      .delete()
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }

  const { error: logError } = await veltzy()
    .from('activity_logs')
    .insert({
      company_id: companyId,
      user_id: userId,
      action: 'bulk_delete',
      resource_type: 'deal',
      metadata: { deal_ids: dealIds, count: dealIds.length },
    })
  if (logError) throw logError
}

export const moveDealToPipeline = async (companyId: string, dealId: string, targetPipelineId: string): Promise<DealWithLead> => {
  const { data: firstStage, error: stageError } = await veltzy()
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', targetPipelineId)
    .order('position')
    .limit(1)
    .single()
  if (stageError) throw stageError

  const { data, error } = await veltzy()
    .from('deals')
    .update({ pipeline_id: targetPipelineId, stage_id: firstStage.id })
    .eq('id', dealId)
    .eq('company_id', companyId)
    .select(DEAL_WITH_LEAD_SELECT)
    .single()
  if (error) throw error
  return data
}

export const bulkMoveToPipeline = async (companyId: string, dealIds: string[], targetPipelineId: string): Promise<void> => {
  const { data: firstStage, error: stageError } = await veltzy()
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', targetPipelineId)
    .order('position')
    .limit(1)
    .single()
  if (stageError) throw stageError

  const batches = chunk(dealIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('deals')
      .update({ pipeline_id: targetPipelineId, stage_id: firstStage.id })
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }
}
