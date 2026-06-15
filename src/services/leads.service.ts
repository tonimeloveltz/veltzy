import { supabase, veltzy } from '@/lib/supabase'
import type {
  Lead, LeadWithDetails, CreateLeadInput, UpdateLeadInput,
  CreateLeadWithDealInput, Deal, DealStatus,
} from '@/types/database'
import { normalizePhoneBR } from '@/lib/phone'

/**
 * Resolve whatsapp_instance_name para leads criados manualmente ou importados.
 * So roda quando a empresa usa Evolution API.
 *
 * Cadeia de fallback:
 * 1. default_whatsapp_instance do vendedor atribuido (assigned_to)
 * 2. sdr_instance_name do pipeline
 * 3. primeira instancia com status 'connected' da empresa
 * 4. null (empresa sem Evolution / sem instancias)
 */
export async function resolveWhatsAppInstance(
  companyId: string,
  assignedTo?: string | null,
  pipelineId?: string | null,
): Promise<string | null> {
  // Verificar se empresa usa Evolution
  const { data: company } = await supabase
    .from('companies')
    .select('active_whatsapp_provider')
    .eq('id', companyId)
    .single()

  if (company?.active_whatsapp_provider !== 'evolution') return null

  // 1. default_whatsapp_instance do vendedor atribuido
  if (assignedTo) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('default_whatsapp_instance')
      .eq('id', assignedTo)
      .single()

    if (profile?.default_whatsapp_instance) return profile.default_whatsapp_instance
  }

  // 2. sdr_instance_name do pipeline
  if (pipelineId) {
    const { data: pipeline } = await veltzy()
      .from('pipelines')
      .select('sdr_instance_name')
      .eq('id', pipelineId)
      .single()

    if (pipeline?.sdr_instance_name) return pipeline.sdr_instance_name
  }

  // 3. primeira instancia connected da empresa
  const { data: instances } = await supabase
    .from('evolution_instances')
    .select('instance_name')
    .eq('company_id', companyId)
    .eq('status', 'connected')
    .order('created_at', { ascending: true })
    .limit(1)

  if (instances && instances.length > 0) return instances[0].instance_name

  // 4. nenhuma instancia disponivel
  return null
}

const LEAD_WITH_DETAILS_SELECT = `
  *,
  lead_sources:source_id(*),
  pipeline_stages:stage_id(*),
  pipelines:pipeline_id(*)
`

interface LeadFilters {
  stageId?: string
  sourceId?: string | null
  temperature?: string | null
  assignedTo?: string | null
  pipelineId?: string
  search?: string
  limit?: number
  offset?: number
}

const sanitizeSearch = (search: string) =>
  search.replace(/[%_\\]/g, '\\$&')

export const getLeadsByCompany = async (companyId: string, filters?: LeadFilters): Promise<LeadWithDetails[]> => {
  const limit = filters?.limit ?? 100
  const offset = filters?.offset ?? 0

  let query = veltzy()
    .from('leads')
    .select(LEAD_WITH_DETAILS_SELECT)
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
  if (filters?.sourceId) {
    query = query.eq('source_id', filters.sourceId)
  }
  if (filters?.temperature) {
    query = query.eq('temperature', filters.temperature)
  }
  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo)
  }
  if (filters?.search) {
    const sanitized = sanitizeSearch(filters.search)
    query = query.or(`name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export const getLeadById = async (companyId: string, leadId: string): Promise<LeadWithDetails> => {
  const { data, error } = await veltzy()
    .from('leads')
    .select(LEAD_WITH_DETAILS_SELECT)
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single()
  if (error) throw error
  return data
}

export const createLead = async (companyId: string, input: CreateLeadInput): Promise<Lead> => {
  // Verificar limite de leads
  const { data: limits } = await supabase.rpc('check_company_limits', {
    p_company_id: companyId,
    p_type: 'leads',
  })
  if (limits && !limits.allowed) {
    throw new Error(`Limite de ${limits.limit} leads atingido. Entre em contato para fazer upgrade.`)
  }

  const normalized = { ...input, company_id: companyId }
  if (normalized.phone) normalized.phone = normalizePhoneBR(normalized.phone)

  // Resolver whatsapp_instance_name se nao foi fornecido
  if (!normalized.whatsapp_instance_name) {
    normalized.whatsapp_instance_name = await resolveWhatsAppInstance(
      companyId,
      normalized.assigned_to,
      normalized.pipeline_id,
    )
  }

  const { data, error } = await veltzy()
    .from('leads')
    .insert(normalized)
    .select()
    .single()
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique') || error.code === '23505') {
      throw new Error('Já existe um lead com este telefone')
    }
    throw error
  }
  return data
}

/**
 * Cria contato + negocio numa unica operacao do ponto de vista da UI.
 *
 * Ponto unico de criacao manual no browser (modal "Novo Lead"). O deal nasce
 * no mesmo stage/pipeline do lead, com status derivado do estagio:
 *   - estagio aberto        -> status 'open'
 *   - estagio final positivo -> status 'won'  + closed_at
 *   - estagio final negativo -> status 'lost' + closed_at
 *
 * Para venda retroativa, `input.closed_at` define a data real do fechamento
 * (cai no mes correto nos relatorios). Se ausente em estagio final, usa agora.
 *
 * O insert do deal seta status/closed_at direto: o trigger
 * set_deal_status_on_stage_change e BEFORE UPDATE e nao dispara no insert.
 *
 * Consistencia: se o deal falhar, o lead recem-criado e removido (rollback
 * best-effort) para nao reintroduzir lead orfao.
 */
export const createLeadWithDeal = async (
  companyId: string,
  input: CreateLeadWithDealInput,
): Promise<{ lead: Lead; deal: Deal }> => {
  const { closed_at: closedAtInput, ...leadInput } = input

  const lead = await createLead(companyId, leadInput)

  // Derivar status/closed_at a partir do estagio escolhido
  const { data: stage } = await veltzy()
    .from('pipeline_stages')
    .select('is_final, is_positive')
    .eq('id', leadInput.stage_id)
    .maybeSingle()

  let status: DealStatus = 'open'
  let closedAt: string | null = null
  if (stage?.is_final) {
    status = stage.is_positive ? 'won' : 'lost'
    closedAt = closedAtInput ?? new Date().toISOString()
  }

  const { data: deal, error } = await veltzy()
    .from('deals')
    .insert({
      company_id: companyId,
      lead_id: lead.id,
      name: leadInput.name ? `Negocio - ${leadInput.name}` : 'Negocio',
      value: leadInput.deal_value ?? 0,
      stage_id: leadInput.stage_id,
      pipeline_id: leadInput.pipeline_id,
      assigned_to: leadInput.assigned_to ?? null,
      status,
      closed_at: closedAt,
    })
    .select()
    .single()

  if (error) {
    // Rollback: o lead nasceu mas o deal falhou. Remover o lead orfao.
    await veltzy().from('leads').delete().eq('id', lead.id).eq('company_id', companyId)
    throw error
  }

  return { lead, deal }
}

export const updateLead = async (companyId: string, leadId: string, input: UpdateLeadInput): Promise<Lead> => {
  const payload = { ...input }
  if (payload.phone) payload.phone = normalizePhoneBR(payload.phone)

  const { data, error } = await veltzy()
    .from('leads')
    .update(payload)
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteLead = async (companyId: string, leadId: string): Promise<void> => {
  const { error } = await veltzy()
    .from('leads')
    .delete()
    .eq('id', leadId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const moveLeadToStage = async (companyId: string, leadId: string, stageId: string): Promise<Lead> => {
  const { data, error } = await veltzy()
    .from('leads')
    .update({ stage_id: stageId })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateDealValueAndMove = async (
  companyId: string,
  leadId: string,
  stageId: string,
  dealValue: number
): Promise<Lead> => {
  const { data, error } = await veltzy()
    .from('leads')
    .update({ stage_id: stageId, deal_value: dealValue })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select()
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

export const bulkUpdateAssignedTo = async (companyId: string, leadIds: string[], targetUserId: string): Promise<void> => {
  const batches = chunk(leadIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('leads')
      .update({ assigned_to: targetUserId })
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }
}

export const bulkArchive = async (companyId: string, leadIds: string[]): Promise<void> => {
  const batches = chunk(leadIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('leads')
      .update({ status: 'archived' as const })
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }
}

export const bulkDelete = async (companyId: string, leadIds: string[], userId: string): Promise<void> => {
  const batches = chunk(leadIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('leads')
      .delete()
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }

  // Log manual de bulk_delete (trigger nao cobre DELETE)
  const { error: logError } = await veltzy()
    .from('activity_logs')
    .insert({
      company_id: companyId,
      user_id: userId,
      action: 'bulk_delete',
      resource_type: 'lead',
      metadata: { lead_ids: leadIds, count: leadIds.length },
    })
  if (logError) throw logError
}

export const bulkMoveToPipeline = async (companyId: string, leadIds: string[], targetPipelineId: string): Promise<void> => {
  // Buscar primeiro stage do pipeline destino
  const { data: firstStage, error: stageError } = await veltzy()
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', targetPipelineId)
    .order('position')
    .limit(1)
    .single()
  if (stageError) throw stageError

  const batches = chunk(leadIds, BATCH_SIZE)
  for (const batch of batches) {
    const { error } = await veltzy()
      .from('leads')
      .update({ pipeline_id: targetPipelineId, stage_id: firstStage.id })
      .in('id', batch)
      .eq('company_id', companyId)
    if (error) throw error
  }
}

export const moveLeadToPipeline = async (companyId: string, leadId: string, targetPipelineId: string): Promise<Lead> => {
  const { data: firstStage, error: stageError } = await veltzy()
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', targetPipelineId)
    .order('position')
    .limit(1)
    .single()
  if (stageError) throw stageError

  const { data, error } = await veltzy()
    .from('leads')
    .update({ pipeline_id: targetPipelineId, stage_id: firstStage.id })
    .eq('id', leadId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}
