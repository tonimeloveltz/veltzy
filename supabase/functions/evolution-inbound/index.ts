import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

interface EvolutionInboundPayload {
  company_id: string
  instance_name: string
  phone: string
  sender_name?: string
  message_id: string
  content: string
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction'
  media_url?: string
  media_mime_type?: string
  file_name?: string
  timestamp: string
  // Campos extras por tipo
  latitude?: number
  longitude?: number
  contact_name?: string
  contact_phone?: string
  reaction_emoji?: string
  ad_context?: {
    ad_id?: string
    ad_title?: string
    source_url?: string
    ctwa_clid?: string
  }
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
      console.error('[evolution-inbound] Invalid secret header')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload: EvolutionInboundPayload = await req.json()

    console.log('[evolution-inbound] Received:', JSON.stringify({
      company_id: payload.company_id,
      instance_name: payload.instance_name,
      phone: payload.phone,
      message_type: payload.message_type,
    }))

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabasePublic = createClient(url, key)

    // 2. Verificar que empresa usa Evolution
    const { data: company } = await supabasePublic
      .from('companies')
      .select('active_whatsapp_provider')
      .eq('id', payload.company_id)
      .single()

    if (company?.active_whatsapp_provider !== 'evolution') {
      console.warn(`[evolution-inbound] Company ${payload.company_id} not using evolution (provider=${company?.active_whatsapp_provider})`)
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'not_evolution' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Normalizar tipos especiais
    let { content } = payload
    let messageType = payload.message_type as string

    // Location: salvar coordenadas no content para renderizacao
    if (payload.message_type === 'location' && payload.latitude != null && payload.longitude != null) {
      content = content || `${payload.latitude},${payload.longitude}`
    }

    // Contact: salvar nome e telefone no content
    if (payload.message_type === 'contact' && payload.contact_name) {
      content = content || `${payload.contact_name}${payload.contact_phone ? `\n${payload.contact_phone}` : ''}`
    }

    // Reaction: tratar como texto com emoji (DB nao tem tipo reaction)
    if (payload.message_type === 'reaction') {
      messageType = 'text'
      content = payload.reaction_emoji ?? content ?? ''
    }

    // Tipos desconhecidos: mapear para texto para nao quebrar CHECK constraint do DB
    const validTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact']
    if (!validTypes.includes(messageType)) {
      console.warn(`[evolution-inbound] Unknown message_type '${messageType}', falling back to text`)
      messageType = 'text'
    }

    // 4. Delegar para handler compartilhado
    const result = await handleInboundMessage({
      supabaseUrl: url,
      supabaseKey: key,
      companyId: payload.company_id,
      phone: normalizePhoneBR(payload.phone),
      senderName: payload.sender_name ?? null,
      content,
      messageType,
      externalId: payload.message_id,
      fileUrl: payload.media_url ?? null,
      fileName: payload.file_name ?? null,
      fileMimeType: payload.media_mime_type ?? null,
      source: 'whatsapp',
      instanceName: payload.instance_name,
      adContext: payload.ad_context ?? null,
      profilePicUrl: payload.profile_pic_url ?? null,
    })

    console.log(`[evolution-inbound] Processed: leadId=${result.leadId}, isNew=${result.isNewLead}`)

    return new Response(
      JSON.stringify({ ok: true, leadId: result.leadId, isNewLead: result.isNewLead }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[evolution-inbound] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
