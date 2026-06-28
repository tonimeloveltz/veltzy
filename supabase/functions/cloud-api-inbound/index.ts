import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { verifyMetaSignature } from '../_shared/meta-signature.ts'
import { resolveCloudApiNumber, ResolvedNumber } from '../_shared/cloud-api-resolve.ts'
import { downloadAndPersistCloudApiMedia } from '../_shared/cloud-api-media.ts'

// NOTA: processamento de statuses[] (delivery/read) e eventos de coexistencia
// (account_offboarded/reconnected) sao Fase 3. Esta funcao trata apenas:
// GET hub.challenge + verificacao HMAC + messages[].

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // --- GET: verificacao do endpoint pela Meta (hub.challenge) ---
  if (req.method === 'GET') {
    const u = new URL(req.url)
    const mode = u.searchParams.get('hub.mode')
    const token = u.searchParams.get('hub.verify_token')
    const challenge = u.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token && token === Deno.env.get('META_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // --- POST: validar assinatura sobre o body CRU (antes de qualquer parse) ---
  const rawBody = await req.text()
  const appSecret = Deno.env.get('META_APP_SECRET')!
  const valid = await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)
  if (!valid) {
    console.error('[cloud-api-inbound] invalid signature')
    return json({ error: 'Unauthorized' }, 401)
  }

  // deno-lint-ignore no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseVeltzy = createClient(url, key, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(url, key)

  // --- Loop sobre entry[].changes[].value ---
  // Erro de item individual nunca derruba a resposta: sempre 200 no fim
  // (exceto 401 assinatura / 400 JSON acima) para a Meta nao reenfileirar.
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value) continue

        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // 1. Resolver tenant pelo phone_number_id (Meta nao manda company_id)
        const resolved = await resolveCloudApiNumber(supabaseVeltzy, phoneNumberId)
        if (!resolved) {
          console.warn(`[cloud-api-inbound] phone_number_id nao mapeado: ${phoneNumberId}`)
          continue
        }

        // 2. Guard de provider — DEPOIS de resolver o tenant
        const { data: company } = await supabasePublic
          .from('companies')
          .select('active_whatsapp_provider')
          .eq('id', resolved.companyId)
          .single()

        if (company?.active_whatsapp_provider !== 'cloud_api') {
          console.warn(`[cloud-api-inbound] company ${resolved.companyId} nao usa cloud_api (provider=${company?.active_whatsapp_provider})`)
          continue
        }

        // 3. Mensagens
        if (Array.isArray(value.messages)) {
          for (const m of value.messages) {
            await processMessage(url, key, resolved, value, m)
          }
        }

        // statuses[] e eventos de coexistencia: Fase 3 (nao processados aqui)
      }
    }
  } catch (err) {
    // Erro inesperado: logar mas ainda 200 (Meta nao reenfileira)
    console.error('[cloud-api-inbound] unexpected error:', err)
  }

  return json({ ok: true })
})

/**
 * Normaliza uma mensagem da Cloud API para InboundParams e delega ao handler
 * compartilhado. Best-effort por mensagem: erro nao derruba as demais nem o 200.
 */
async function processMessage(
  url: string,
  key: string,
  resolved: ResolvedNumber,
  // deno-lint-ignore no-explicit-any
  value: any,
  // deno-lint-ignore no-explicit-any
  m: any,
): Promise<void> {
  try {
    const phone = normalizePhoneBR(m.from)
    const senderName = value?.contacts?.[0]?.profile?.name ?? null

    let messageType = m.type as string
    let content = ''
    let fileUrl: string | null = null
    let fileName: string | null = null
    let fileMimeType: string | null = null

    const token = resolved.accessToken ?? Deno.env.get('META_SYSTEM_USER_TOKEN') ?? ''

    switch (m.type) {
      case 'text':
        content = m.text?.body ?? ''
        break
      case 'image':
      case 'audio':
      case 'video':
      case 'document':
      case 'sticker': {
        const media = m[m.type]
        content = media?.caption ?? ''
        fileName = media?.filename ?? null
        fileMimeType = media?.mime_type ?? null
        if (media?.id && token) {
          const persisted = await downloadAndPersistCloudApiMedia(
            url, key, resolved.companyId, media.id, token, fileMimeType,
          )
          if (persisted) {
            fileUrl = persisted.fileUrl
            fileMimeType = persisted.mimeType
          }
        }
        break
      }
      case 'location':
        content = `${m.location?.latitude},${m.location?.longitude}`
        break
      case 'contacts': {
        const c = m.contacts?.[0]
        content = `${c?.name?.formatted_name ?? ''}\n${c?.phones?.[0]?.phone ?? ''}`.trim()
        messageType = 'contact'
        break
      }
      case 'reaction':
        messageType = 'text'
        content = m.reaction?.emoji ?? ''
        break
      case 'interactive':
        messageType = 'text'
        content = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ''
        break
      case 'button':
        messageType = 'text'
        content = m.button?.text ?? ''
        break
      default:
        messageType = 'text'
        content = ''
    }

    // Tipos fora do CHECK do banco caem para 'text' (igual evolution-inbound)
    const validTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact']
    if (!validTypes.includes(messageType)) {
      console.warn(`[cloud-api-inbound] tipo '${messageType}' desconhecido, fallback para text`)
      messageType = 'text'
    }

    const adContext = m.referral
      ? {
          source_url: m.referral.source_url,
          ctwa_clid: m.referral.ctwa_clid,
          ad_title: m.referral.headline,
          ad_id: m.referral.source_id,
        }
      : null

    const result = await handleInboundMessage({
      supabaseUrl: url,
      supabaseKey: key,
      companyId: resolved.companyId,
      phone,
      senderName,
      content,
      messageType,
      externalId: m.id ?? null,
      fileUrl,
      fileName,
      fileMimeType,
      source: 'whatsapp',
      instanceName: resolved.instanceLabel,
      adContext,
      profilePicUrl: null,
    })

    console.log(`[cloud-api-inbound] processed: leadId=${result.leadId}, isNew=${result.isNewLead}, wamid=${m.id}`)
  } catch (err) {
    console.error('[cloud-api-inbound] processMessage error:', err)
  }
}
