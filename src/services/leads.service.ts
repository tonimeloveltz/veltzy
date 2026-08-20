import { supabase, veltzy } from '@/lib/supabase'
import type {
  Lead, LeadWithDetails, CreateLeadInput, UpdateLeadInput,
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
  lead_sources:source_id(*)
`

// Sem `pipelineId`: o pipeline saiu de `leads` na Onda 4 e nao ha coluna para
// filtrar. Quem precisa de recorte por funil deriva de `deals`.
interface LeadFilters {
  sourceId?: string | null
  temperature?: string | null
  assignedTo?: string | null
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

  // Nenhum campo de negocio (pipeline_id, stage_id, deal_value, status) e
  // gravado em `leads`: todos moram em `deals`. `input.pipeline_id` continua
  // sendo aceito, mas so como contexto da chamada, para resolver a instancia de
  // WhatsApp acima. Nao e persistido.
  const { data, error } = await veltzy()
    .from('leads')
    .insert({
      company_id: companyId,
      name: normalized.name,
      phone: normalized.phone,
      email: normalized.email,
      company_name: normalized.company_name,
      source_id: normalized.source_id,
      temperature: normalized.temperature,
      observations: normalized.observations,
      assigned_to: normalized.assigned_to,
      tags: normalized.tags,
      instagram_handle: normalized.instagram_handle,
      linkedin_url: normalized.linkedin_url,
      whatsapp_instance_name: normalized.whatsapp_instance_name,
    })
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
