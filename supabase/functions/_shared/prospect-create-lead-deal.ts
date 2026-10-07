// Funcao ESTREITA de criacao de contato+negocio para a prospeccao em grupos.
// Deliberadamente NAO usa handleInboundMessage (que insere mensagem, cria deal no
// pipeline default e dispara SDR/SLA/fila/auto-reply). Aqui: lead upsert por
// (company_id, phone) + UM deal na pipeline de Prospeccao. SEM insert em messages,
// SEM SDR, SEM SLA, SEM fila de distribuicao, SEM auto-reply.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildDealName } from './deal-name.ts'

export interface CreateLeadDealInput {
  supabaseUrl: string
  supabaseKey: string
  companyId: string
  phone: string
  /** nome do contato (pushName do grupo), se houver. */
  name?: string | null
  /** sessao dedicada que originou (carimba lead.whatsapp_instance_name + deal.origin_instance_name). */
  sessionName: string
  /** nome do grupo -> tag 'grupo:<nome>' no LEAD (deals nao tem coluna tags). */
  groupName?: string | null
  /** pipeline "Prospeccao grupos" (sem SDR). */
  pipelineId: string
  /** lead_source grupo-whatsapp. */
  sourceId?: string | null
}

export interface CreateLeadDealResult {
  leadId: string
  dealId: string | null
}

export async function prospectCreateLeadDeal(input: CreateLeadDealInput): Promise<CreateLeadDealResult> {
  const supabase = createClient(input.supabaseUrl, input.supabaseKey, { db: { schema: 'veltzy' } })
  const groupTag = input.groupName ? `grupo:${input.groupName}` : null

  // 1. Lead find-or-create por (company_id, phone).
  const { data: existing } = await supabase
    .from('leads')
    .select('id, name, tags')
    .eq('company_id', input.companyId)
    .eq('phone', input.phone)
    .maybeSingle()

  let leadId: string
  let leadName: string | null

  if (existing) {
    leadId = existing.id
    leadName = existing.name ?? null
    // Merge da tag do grupo (sem duplicar), sem mexer em mais nada do lead.
    if (groupTag) {
      const tags: string[] = Array.isArray(existing.tags) ? existing.tags : []
      if (!tags.includes(groupTag)) {
        await supabase.from('leads').update({ tags: [...tags, groupTag] }).eq('id', leadId)
      }
    }
  } else {
    const { data: created, error } = await supabase
      .from('leads')
      .insert({
        company_id: input.companyId,
        phone: input.phone,
        name: input.name ?? null,
        source_id: input.sourceId ?? null,
        whatsapp_instance_name: input.sessionName,
        whatsapp_provider: 'waha',
        tags: groupTag ? [groupTag] : null,
        // Prospeccao: ninguem atribuido (humano assume depois); fora da fila de distribuicao.
        is_queued: false,
      })
      .select('id, name')
      .single()
    if (error) throw error
    leadId = created.id
    leadName = created.name ?? null
  }

  // 2. Deal na pipeline de Prospeccao (guard 1 por pipeline, como o handler).
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', input.pipelineId)
    .order('position')
    .limit(1)
    .maybeSingle()
  if (!firstStage) return { leadId, dealId: null }

  const { data: existingDeal } = await supabase
    .from('deals')
    .select('id')
    .eq('lead_id', leadId)
    .eq('pipeline_id', input.pipelineId)
    .limit(1)
    .maybeSingle()
  if (existingDeal) return { leadId, dealId: existingDeal.id }

  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .insert({
      company_id: input.companyId,
      lead_id: leadId,
      name: buildDealName(leadName ?? input.phone),
      pipeline_id: input.pipelineId,
      stage_id: firstStage.id,
      status: 'open',
      assigned_to: null,
      source_id: input.sourceId ?? null,
      origin_instance_name: input.sessionName,
    })
    .select('id')
    .single()
  if (dealErr) throw dealErr

  return { leadId, dealId: deal.id }
}
