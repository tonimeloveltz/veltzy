import { supabase, veltzy } from '@/lib/supabase'
import type {
  AudienceFilter,
  BlastCampaign,
  BlastRecipient,
} from '@/types/database'
import type { WhatsAppTemplate } from '@/types/whatsapp-template'

/** Campanha com o template embedado (nome/status) para a lista. */
export interface CampaignWithTemplate extends BlastCampaign {
  template: Pick<WhatsAppTemplate, 'id' | 'name' | 'status'> | null
}

export const getCampaigns = async (companyId: string): Promise<CampaignWithTemplate[]> => {
  const { data, error } = await veltzy()
    .from('blast_campaigns')
    .select('*, template:template_id(id, name, status)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as CampaignWithTemplate[]
}

/** Templates da empresa (fonte de conteudo da campanha). */
export const getTemplates = async (companyId: string): Promise<WhatsAppTemplate[]> => {
  const { data, error } = await veltzy()
    .from('whatsapp_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as WhatsAppTemplate[]
}

/**
 * Conta a audiencia elegivel de um filtro — MESMA regra da edge blast-dispatch
 * (company + exclui opt-out + temperature/tags/source_id). So conta leads com telefone.
 */
export const countAudience = async (companyId: string, filter: AudienceFilter): Promise<number> => {
  let q = veltzy()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('marketing_opt_out', false)
    .not('phone', 'is', null)
  if (filter.temperature?.length) q = q.in('temperature', filter.temperature)
  if (filter.tags?.length) q = q.overlaps('tags', filter.tags)
  if (filter.source_id) q = q.eq('source_id', filter.source_id)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export interface CreateCampaignInput {
  name: string
  template_id: string
  variable_mapping: Record<string, string>
  audience_filter: AudienceFilter
  scheduled_at?: string | null
}

export const createCampaign = async (
  companyId: string,
  createdBy: string | null,
  input: CreateCampaignInput,
): Promise<BlastCampaign> => {
  const { data, error } = await veltzy()
    .from('blast_campaigns')
    .insert({
      company_id: companyId,
      name: input.name,
      template_id: input.template_id,
      variable_mapping: input.variable_mapping,
      audience_filter: input.audience_filter,
      status: input.scheduled_at ? 'scheduled' : 'draft',
      scheduled_at: input.scheduled_at ?? null,
      created_by: createdBy,
    })
    .select()
    .single()
  if (error) throw error
  return data as unknown as BlastCampaign
}

/** Dispara a campanha: a edge faz gate + audiencia + expande na message_queue. */
export const dispatchCampaign = async (
  campaignId: string,
): Promise<{ ok?: boolean; skipped?: boolean; reason?: string; recipients?: number; queued?: number }> => {
  const { data, error } = await supabase.functions.invoke('blast-dispatch', {
    body: { campaign_id: campaignId },
  })
  if (error) throw error
  return data
}

export const getRecipients = async (campaignId: string): Promise<BlastRecipient[]> => {
  const { data, error } = await veltzy()
    .from('blast_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as BlastRecipient[]
}
