import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

/**
 * Inbound WAHA (multi-provider V2). Espelha evolution-inbound: o Hub
 * (waha-webhook-receiver) normaliza o webhook da WAHA e faz forward pra ca com
 * apikey=HUB_WEBHOOK_SECRET. Identificador do numero = session_name (analogo ao
 * instance_name do Evolution). Guard novo = a empresa tem sessao WAHA registrada
 * (nao depende de active_whatsapp_provider — WAHA nasce multi-provider).
 */
interface WahaInboundPayload {
  company_id: string
  session_name: string
  phone: string
  sender_name?: string
  message_id: string
  content: string
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction'
  media_url?: string
  media_mime_type?: string
  file_name?: string
  timestamp: string
  latitude?: number
  longitude?: number
  contact_name?: string
  contact_phone?: string
  reaction_emoji?: string
  ad_context?: Record<string, unknown>
  profile_pic_url?: string
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validar shared secret (aceita x-hub-secret ou apikey)
    const hubSecret = req.headers.get('x-hub-secret') ?? req.headers.get('apikey')
    const expectedSecret = Deno.env.get('HUB_WEBHOOK_SECRET')

    if (!hubSecret || hubSecret !== expectedSecret) {
      console.error('[waha-inbound] Invalid secret header')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload: WahaInboundPayload = await req.json()

    console.log('[waha-inbound] Received:', JSON.stringify({
      company_id: payload.company_id,
      session_name: payload.session_name,
      phone: payload.phone,
      message_type: payload.message_type,
    }))

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabasePublic = createClient(url, key)

    // 2. Guard multi-provider: a sessao WAHA precisa existir e pertencer a empresa.
    //    (waha_instances tem RLS super_admin; aqui roda com service_role.)
    const { data: instance } = await supabasePublic
      .from('waha_instances')
      .select('company_id')
      .eq('session_name', payload.session_name)
      .maybeSingle()

    if (!instance || instance.company_id !== payload.company_id) {
      console.warn(`[waha-inbound] Sessao ${payload.session_name} nao registrada para company ${payload.company_id}`)
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_waha_instance' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2.1 Guard defensivo de telefone: o NOWEB usa LID addressing e pode mandar
    //     from=@lid (nao-telefone) ou vazio em status@broadcast/grupos. Normalizado,
    //     um numero BR real fica com 12-13 digitos (55 + 10/11). Fora dessa janela
    //     (vazio, @lid com 15 digitos, etc) e lixo -> NAO cria lead. O fix da
    //     normalizacao real (remoteJidAlt) e no waha-webhook-receiver do Hub.
    const normalizedPhone = normalizePhoneBR(payload.phone)
    if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 13) {
      console.warn(`[waha-inbound] Telefone invalido apos normalizacao (raw='${payload.phone}', norm='${normalizedPhone}') — pulando, sem criar lead`)
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'invalid_phone' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Normalizar tipos especiais (mesma logica do evolution-inbound)
    let { content } = payload
    let messageType = payload.message_type as string

    if (payload.message_type === 'location' && payload.latitude != null && payload.longitude != null) {
      content = content || `${payload.latitude},${payload.longitude}`
    }

    if (payload.message_type === 'contact' && payload.contact_name) {
      content = content || `${payload.contact_name}${payload.contact_phone ? `\n${payload.contact_phone}` : ''}`
    }

    if (payload.message_type === 'reaction') {
      messageType = 'text'
      content = payload.reaction_emoji ?? content ?? ''
    }

    const validTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact']
    if (!validTypes.includes(messageType)) {
      console.warn(`[waha-inbound] Unknown message_type '${messageType}', falling back to text`)
      messageType = 'text'
    }

    // 4. Delegar para o handler compartilhado, carimbando o provider da conversa.
    const result = await handleInboundMessage({
      supabaseUrl: url,
      supabaseKey: key,
      companyId: payload.company_id,
      phone: normalizedPhone,
      senderName: payload.sender_name ?? null,
      content,
      messageType,
      externalId: payload.message_id,
      fileUrl: payload.media_url ?? null,
      fileName: payload.file_name ?? null,
      fileMimeType: payload.media_mime_type ?? null,
      source: 'whatsapp',
      instanceName: payload.session_name,
      whatsappProvider: 'waha',
      adContext: payload.ad_context ?? null,
      profilePicUrl: payload.profile_pic_url ?? null,
    })

    console.log(`[waha-inbound] Processed: leadId=${result.leadId}, isNew=${result.isNewLead}`)

    return new Response(
      JSON.stringify({ ok: true, leadId: result.leadId, isNewLead: result.isNewLead }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[waha-inbound] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
