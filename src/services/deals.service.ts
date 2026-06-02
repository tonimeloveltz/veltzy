import { veltzy } from '@/lib/supabase'
import type { DealWithLead, CreateDealInput, UpdateDealInput } from '@/types/database'

const DEAL_WITH_LEAD_SELECT = `
  *,
  leads:lead_id(id, name, phone, email, avatar_url, temperature, tags, is_ai_active, transfer_summary, source_id, created_at,
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
    .in('status', ['open', 'pending_assignment'])
    .order('created_at', { ascending: false })
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

export const moveDealStage = async (
  companyId: string,
  dealId: string,
  stageId: string,
  pipelineId?: string,
): Promise<DealWithLead> => {
  const payload: Record<string, unknown> = { stage_id: stageId }
  if (pipelineId) payload.pipeline_id = pipelineId

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
