import { veltzy as db, supabase } from '@/lib/supabase'
import type { Message, SendMessagePayload, LeadWithLastMessage } from '@/types/database'

export const getMessages = async (companyId: string, leadId: string): Promise<Message[]> => {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('lead_id', leadId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export const sendMessage = async (companyId: string, payload: SendMessagePayload): Promise<Message> => {
  const { data, error } = await db()
    .from('messages')
    .insert({
      lead_id: payload.leadId,
      company_id: companyId,
      content: payload.content,
      sender_type: 'human',
      message_type: payload.messageType ?? 'text',
      file_url: payload.fileUrl ?? null,
      file_name: payload.fileName ?? null,
      file_mime_type: payload.mimeType ?? null,
      source: 'manual',
      replied_message_id: payload.repliedMessageId ?? null,
    })
    .select()
    .single()
  if (error) throw error

  await db()
    .from('leads')
    .update({ conversation_status: 'replied' })
    .eq('id', payload.leadId)

  // F3: Popula first_response_at na primeira resposta do vendedor
  await db()
    .from('leads')
    .update({ first_response_at: new Date().toISOString() })
    .eq('id', payload.leadId)
    .is('first_response_at', null)

  return data
}

export const markAsRead = async (companyId: string, leadId: string): Promise<void> => {
  const { error } = await db()
    .from('leads')
    .update({ conversation_status: 'read' })
    .eq('id', leadId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const getConversationList = async (companyId: string): Promise<LeadWithLastMessage[]> => {
  const { data, error } = await db().rpc('get_conversation_list', { p_company_id: companyId })
  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    company_id: row.company_id as string,
    name: row.name as string | null,
    phone: row.phone as string,
    email: row.email as string | null,
    instagram_id: row.instagram_id as string | null,
    linkedin_id: row.linkedin_id as string | null,
    source_id: row.source_id as string | null,
    stage_id: row.stage_id as string,
    status: row.status,
    temperature: row.temperature,
    ai_score: row.ai_score as number,
    assigned_to: row.assigned_to as string | null,
    is_ai_active: row.is_ai_active as boolean,
    is_queued: row.is_queued as boolean,
    conversation_status: row.conversation_status,
    tags: row.tags as string[],
    deal_value: row.deal_value as number | null,
    observations: row.observations as string | null,
    avatar_url: row.avatar_url as string | null,
    ad_context: row.ad_context ?? null,
    last_customer_message_at: (row.last_customer_message_at as string) ?? null,
    sla_breached: (row.sla_breached as boolean) ?? false,
    first_response_at: (row.first_response_at as string) ?? null,
    whatsapp_instance_name: (row.whatsapp_instance_name as string) ?? null,
    transfer_summary: (row.transfer_summary as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    profiles: row.assigned_to ? {
      id: row.assigned_to as string,
      name: row.assigned_name as string,
      email: row.assigned_email as string,
      is_available: row.assigned_available as boolean,
    } : null,
    lead_sources: row.source_id ? {
      id: row.source_id as string,
      name: row.source_name as string,
      slug: row.source_slug as string,
      color: row.source_color as string,
      icon_name: row.source_icon as string,
    } : null,
    last_message: row.last_message_at ? {
      content: row.last_message_content as string,
      sender_type: row.last_message_sender as string,
      created_at: row.last_message_at as string,
      message_type: row.last_message_type as string,
    } : null,
    unread_count: Number(row.unread_count) || 0,
  })) as LeadWithLastMessage[]
}

export const isWhatsAppConnected = async (companyId: string): Promise<boolean> => {
  // Verificar provider ativo da empresa
  const { data: company } = await supabase
    .from('companies')
    .select('active_whatsapp_provider')
    .eq('id', companyId)
    .single()

  const provider = company?.active_whatsapp_provider ?? 'zapi'

  if (provider === 'evolution') {
    // Para Evolution, consideramos "conectado" se empresa usa Evolution.
    // A validacao real acontece no backend ao enviar.
    return true
  }

  // Fluxo Z-API
  const { data } = await supabase
    .from('oauth_integrations')
    .select('id')
    .eq('provider', 'zapi')
    .eq('company_id', companyId)
    .eq('status', 'connected')
    .maybeSingle()
  return !!data
}

export const isInstagramConnected = async (companyId: string): Promise<boolean> => {
  const { data } = await db()
    .from('instagram_connections')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}

export const getLeadPhoneAndSource = async (
  companyId: string,
  leadId: string,
): Promise<{ phone: string | null; sourceSlug: string | null }> => {
  const { data } = await db()
    .from('leads')
    .select('phone, lead_sources:source_id(slug)')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single()
  const sources = (data as Record<string, unknown>)?.lead_sources as { slug: string } | null
  return {
    phone: (data as Record<string, unknown>)?.phone as string | null,
    sourceSlug: sources?.slug ?? null,
  }
}

export const routeMessage = async (
  companyId: string,
  payload: SendMessagePayload,
): Promise<Message> => {
  const { phone, sourceSlug } = await getLeadPhoneAndSource(companyId, payload.leadId)
  const whatsAppConnected = phone ? await isWhatsAppConnected(companyId) : false

  // Lead com phone + WhatsApp conectado: envia via whatsapp-send (roteia internamente por provider)
  if (phone && whatsAppConnected) {
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: payload,
    })
    if (error) throw error
    return data as Message
  }

  if (sourceSlug === 'instagram') {
    const connected = await isInstagramConnected(companyId)
    if (connected) {
      const { data, error } = await supabase.functions.invoke('instagram-send', {
        body: { leadId: payload.leadId, content: payload.content, companyId },
      })
      if (error) throw error
      return data as Message
    }
  }

  // Sem phone, sem WhatsApp, ou sem integracao: salva como manual
  return sendMessage(companyId, payload)
}
