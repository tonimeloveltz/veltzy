import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getWhatsAppConfigByInstanceId, updateWhatsAppMetadata } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

interface ZAPIPayload {
  phone: string
  isGroup: boolean
  fromMe: boolean
  momment: number
  messageId: string
  instanceId: string
  chatName?: string
  senderName?: string
  type?: string
  text?: { message: string }
  image?: { caption?: string; imageUrl?: string; mimeType?: string }
  audio?: { audioUrl?: string; mimeType?: string }
  video?: { caption?: string; videoUrl?: string; mimeType?: string }
  document?: { caption?: string; documentUrl?: string; fileName?: string; mimeType?: string }
  referral?: {
    headline?: string; body?: string
    sourceUrl?: string; thumbnailUrl?: string
    mediaUrl?: string; ctwaClid?: string
    sourceId?: string; sourceType?: string
  }
}

const normalizePhone = (phone: string): string => {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits
  }
  return digits
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: ZAPIPayload = await req.json()

    // Ignorar mensagens proprias, grupos e callbacks de status
    if (payload.fromMe || payload.isGroup) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (payload.type === 'StatusCallback' || payload.type === 'ReadReceiptCallback' || payload.type === 'MessageUpdateCallback') {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabasePublic = createClient(url, key)

    // Validar token Z-API
    const zapiToken = req.headers.get('z-api-token')
    const config = await getWhatsAppConfigByInstanceId(supabasePublic, payload.instanceId)

    if (!config || !zapiToken || zapiToken !== (config.metadata.token as string)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Garantir status connected
    if (config.status !== 'connected') {
      await updateWhatsAppMetadata(supabasePublic, config.id, { status: 'connected' })
    }

    // Normalizar payload Z-API para formato generico
    const phone = normalizePhone(payload.phone)

    let content = ''
    let messageType = 'text'
    let fileUrl: string | null = null
    let fileName: string | null = null
    let fileMimeType: string | null = null

    if (payload.text?.message) {
      content = payload.text.message
    } else if (payload.image) {
      content = payload.image.caption ?? ''
      messageType = 'image'
      fileUrl = payload.image.imageUrl ?? null
      fileMimeType = payload.image.mimeType ?? null
    } else if (payload.audio) {
      messageType = 'audio'
      fileUrl = payload.audio.audioUrl ?? null
      fileMimeType = payload.audio.mimeType ?? null
    } else if (payload.video) {
      content = payload.video.caption ?? ''
      messageType = 'video'
      fileUrl = payload.video.videoUrl ?? null
      fileMimeType = payload.video.mimeType ?? null
    } else if (payload.document) {
      content = payload.document.caption ?? ''
      messageType = 'document'
      fileUrl = payload.document.documentUrl ?? null
      fileName = payload.document.fileName ?? null
      fileMimeType = payload.document.mimeType ?? null
    }

    // Nota (feature origem-por-pipeline, §5): o referral do Z-API (legado) NAO traz ad_id.
    // Logo, o roteamento por campanha (ad_id) nao casa por este caminho: degrada para
    // instancia/default. Nao e bug, e limitacao do provider legado. Evolution/Cloud API trazem ad_id.
    const adContext = payload.referral ? {
      ad_title: payload.referral.headline,
      ad_body: payload.referral.body,
      source_url: payload.referral.sourceUrl,
      media_url: payload.referral.mediaUrl,
      ctwa_clid: payload.referral.ctwaClid,
      source: 'meta_ads',
    } : null

    // Preparar provider para busca de avatar
    const provider = createProvider(config.provider)

    // Delegar para handler compartilhado
    const result = await handleInboundMessage({
      supabaseUrl: url,
      supabaseKey: key,
      companyId: config.company_id,
      phone,
      senderName: payload.senderName ?? payload.chatName ?? null,
      content,
      messageType: messageType === 'audio' && payload.type === 'ptt' ? 'audio' : messageType,
      externalId: payload.messageId,
      fileUrl,
      fileName,
      fileMimeType,
      source: 'whatsapp',
      instanceName: null, // Z-API: sem instance_name (single-instance legado)
      adContext,
      fetchAvatar: { provider, config },
    })

    return new Response(JSON.stringify({ ok: true, leadId: result.leadId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
