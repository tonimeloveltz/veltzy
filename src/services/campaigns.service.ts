import { supabase, veltzy } from '@/lib/supabase'
import type {
  AudienceFilter,
  BlastCampaign,
  BlastRecipient,
  ThrottleConfig,
} from '@/types/database'
import type { WhatsAppTemplate } from '@/types/whatsapp-template'
import { leadIdsInStages } from '@/lib/stage-audience'

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
  // Seleção MANUAL tem precedência (usa exatamente estes; ignora os outros filtros).
  if (filter.manual_ids?.length) {
    q = q.in('id', filter.manual_ids)
  } else {
    if (filter.temperature?.length) q = q.in('temperature', filter.temperature)
    if (filter.tags?.length) q = q.overlaps('tags', filter.tags)
    if (filter.source_id) q = q.eq('source_id', filter.source_id)
    // Etapa: resolve os lead_ids pelo deal aberto mais recente (mesmo critério da edge),
    // p/ a contagem ao vivo bater com o disparo real.
    if (filter.stage_id?.length) {
      const { data: openDeals } = await veltzy()
        .from('deals').select('lead_id, stage_id, created_at').eq('company_id', companyId).eq('status', 'open')
      const stageLeadIds = leadIdsInStages(openDeals ?? [], filter.stage_id)
      if (stageLeadIds.length === 0) return 0
      q = q.in('id', stageLeadIds)
    }
  }
  // Excluir recentes: remove quem recebeu mensagem nos últimos N dias (mesma regra da edge).
  if (filter.exclude_recent_days && filter.exclude_recent_days > 0) {
    const since = new Date(Date.now() - filter.exclude_recent_days * 86_400_000).toISOString()
    const { data: recent } = await veltzy()
      .from('messages').select('lead_id').eq('company_id', companyId).gte('created_at', since).not('lead_id', 'is', null)
    const recentIds = [...new Set((recent ?? []).map((m: { lead_id: string }) => m.lead_id))]
    if (recentIds.length > 0) q = q.not('id', 'in', `(${recentIds.join(',')})`)
  }
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export interface CreateCampaignInput {
  name: string
  /** Template HSM (obrigatório no Cloud API). null = mensagem livre (WAHA/Evolution). */
  template_id?: string | null
  /** Texto livre (quando sem template). */
  message_body?: string | null
  variable_mapping: Record<string, string>
  audience_filter: AudienceFilter
  /** Override anti-ban por campanha (ThrottleConfig). null = defaults do servidor. */
  anti_ban?: ThrottleConfig | null
  scheduled_at?: string | null
  followup_cadence_id?: string | null
  followup_mode?: 'none' | 'immediate' | 'no_reply'
  followup_delay_days?: number
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
      template_id: input.template_id ?? null,
      message_body: input.message_body ?? null,
      variable_mapping: input.variable_mapping,
      audience_filter: input.audience_filter,
      anti_ban: input.anti_ban ?? null,
      status: input.scheduled_at ? 'scheduled' : 'draft',
      scheduled_at: input.scheduled_at ?? null,
      followup_cadence_id: input.followup_cadence_id ?? null,
      followup_mode: input.followup_mode ?? 'none',
      followup_delay_days: input.followup_delay_days ?? 0,
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

/** Uma campanha com o template embedado. Multi-tenant no codigo (company_id) alem do RLS. */
export const getCampaignById = async (
  companyId: string,
  id: string,
): Promise<CampaignWithTemplate | null> => {
  const { data, error } = await veltzy()
    .from('blast_campaigns')
    .select('*, template:template_id(id, name, status)')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as CampaignWithTemplate) ?? null
}

/** Recipient com nome do lead, o item da fila e a entrega (delivery do receipt Cloud API). */
export interface RecipientDetail extends BlastRecipient {
  lead: { name: string | null } | null
  queue: {
    content: string | null
    status: string | null
    sent_at: string | null
    error_message: string | null
  } | null
  /** Métricas de entrega (Onda 2): sent|delivered|read|failed da mensagem ligada. null = sem mensagem. */
  delivery_status?: string | null
  delivery_updated_at?: string | null
}

/**
 * Recipients da campanha com embedding: lead(name) + message_queue(content, status, ...).
 * FKs (lead_id->leads, message_queue_id->message_queue) habilitam os aliases do PostgREST.
 * Entrega (Onda 2): veltzy.messages é a fonte da verdade do delivery_status; o recipient
 * chega nela pelo message_queue_id (não há FK recipient->messages → query dedicada + map).
 */
export const getCampaignRecipientsDetailed = async (
  campaignId: string,
): Promise<RecipientDetail[]> => {
  const { data, error } = await veltzy()
    .from('blast_recipients')
    .select('*, lead:lead_id(name), queue:message_queue_id(content, status, sent_at, error_message)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const recipients = (data ?? []) as unknown as RecipientDetail[]

  // Anexa o delivery_status da mensagem ligada, por message_queue_id (join por chave).
  const queueIds = recipients.map((r) => r.message_queue_id).filter((id): id is string => !!id)
  if (queueIds.length > 0) {
    const { data: deliveries, error: dErr } = await veltzy()
      .from('messages')
      .select('message_queue_id, delivery_status, delivery_updated_at')
      .in('message_queue_id', queueIds)
    if (dErr) throw dErr
    const byQueue = new Map(
      (deliveries ?? []).map((d: Record<string, unknown>) => [d.message_queue_id as string, d]),
    )
    for (const r of recipients) {
      const d = r.message_queue_id ? byQueue.get(r.message_queue_id) : undefined
      r.delivery_status = (d?.delivery_status as string | null) ?? null
      r.delivery_updated_at = (d?.delivery_updated_at as string | null) ?? null
    }
  }
  return recipients
}
