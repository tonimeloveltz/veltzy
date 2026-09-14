import { veltzy as db, supabase } from '@/lib/supabase'
import { toEdgeFunctionError } from '@/lib/edge-function-error'
import { decideOutboundChannel, isInstagramPlaceholderPhone } from '@/lib/lead-channel'
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

  // A6: Marca mensagens de entrada como lidas via RPC (SECURITY DEFINER, filtra internamente).
  // Best-effort: se falhar, loga e segue -- abrir conversa nao pode quebrar.
  try {
    await db().rpc('mark_lead_messages_read', { p_lead_id: leadId })
  } catch (err) {
    console.error('[markAsRead] RPC mark_lead_messages_read failed:', err)
  }
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
    temperature: row.temperature,
    ai_score: row.ai_score as number,
    assigned_to: row.assigned_to as string | null,
    is_ai_active: row.is_ai_active as boolean,
    is_queued: row.is_queued as boolean,
    conversation_status: row.conversation_status,
    tags: row.tags as string[],
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

  if (provider === 'evolution' || provider === 'cloud_api') {
    // Evolution e Cloud API: empresa "conectada" se usa o provider.
    // A validacao real (instancia/numero) acontece no backend ao enviar.
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
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

export const getLeadPhoneAndSource = async (
  companyId: string,
  leadId: string,
): Promise<{ phone: string | null; sourceSlug: string | null; instagramId: string | null }> => {
  const { data } = await db()
    .from('leads')
    .select('phone, instagram_id, lead_sources:source_id(slug)')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single()
  const row = data as Record<string, unknown> | null
  const sources = row?.lead_sources as { slug: string } | null
  return {
    phone: row?.phone as string | null,
    sourceSlug: sources?.slug ?? null,
    instagramId: (row?.instagram_id as string | null) ?? null,
  }
}

/** Canal da ultima mensagem que o contato mandou (PRD D5). */
export const getLastInboundSource = async (companyId: string, leadId: string): Promise<string | null> => {
  const { data } = await db()
    .from('messages')
    .select('source')
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .eq('sender_type', 'lead')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.source as string | undefined) ?? null
}

export const routeMessage = async (
  companyId: string,
  payload: SendMessagePayload,
): Promise<Message> => {
  const [{ phone, instagramId }, lastInboundSource] = await Promise.all([
    getLeadPhoneAndSource(companyId, payload.leadId),
    getLastInboundSource(companyId, payload.leadId),
  ])
  // Placeholder 'ig_<IGSID>' nao e telefone: nem consulta o WhatsApp para ele.
  const [whatsAppConnected, instagramConnected] = await Promise.all([
    phone && !isInstagramPlaceholderPhone(phone) ? isWhatsAppConnected(companyId) : Promise.resolve(false),
    instagramId ? isInstagramConnected(companyId) : Promise.resolve(false),
  ])

  const channel = decideOutboundChannel({
    lastInboundSource, phone, instagramId, whatsAppConnected, instagramConnected,
  })

  // WhatsApp: whatsapp-send roteia internamente por provider
  if (channel === 'whatsapp') {
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: payload,
    })
    if (error) throw error
    return data as Message
  }

  // Instagram: company vem do JWT no servidor, nunca do body
  if (channel === 'instagram') {
    const { data, error } = await supabase.functions.invoke('instagram-send', {
      body: {
        leadId: payload.leadId,
        content: payload.content,
        messageType: payload.messageType,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
      },
    })
    if (error) throw await toEdgeFunctionError(error)
    return data as Message
  }

  // Sem canal conectado: salva como manual
  return sendMessage(companyId, payload)
}
