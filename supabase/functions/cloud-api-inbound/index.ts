import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { verifyMetaSignature } from '../_shared/meta-signature.ts'
import { resolveCloudApiNumber, ResolvedNumber } from '../_shared/cloud-api-resolve.ts'
import { downloadAndPersistCloudApiMedia } from '../_shared/cloud-api-media.ts'

// NOTA: statuses[] (delivery/read) e eventos de coexistencia
// (account_offboarded/reconnected) sao Fase 3. Esta funcao trata:
// GET hub.challenge + verificacao HMAC + messages[] + smb_message_echoes +
// history + smb_app_state_sync (log) + message_template_status_update (bloco d).

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

        // (d) Status de template (message_template_status_update): field ISOLADO,
        //     resolve por waba_id (entry.id), best-effort. NAO usa phone_number_id
        //     nem o guard de provider; o evento e da WABA, nao de um numero (por
        //     isso e tratado ANTES do check de phone_number_id abaixo).
        if (change.field === 'message_template_status_update') {
          await processTemplateStatusUpdate(supabaseVeltzy, entry.id, value)
          continue
        }

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

        // 3. Mensagens (contato -> empresa)
        if (Array.isArray(value.messages)) {
          for (const m of value.messages) {
            await processMessage(url, key, resolved, value, m)
          }
        }

        // 4. Echoes de coexistence (smb_message_echoes): mensagens que o DONO
        //    mandou pelo app WhatsApp Business. Guard de provider (V1.5) ja
        //    aplicado acima. Entram como sender_type='human' sem side-effects.
        if (Array.isArray(value.message_echoes)) {
          for (const m of value.message_echoes) {
            await processEcho(url, key, resolved, m)
          }
        }

        // 5. History (dump de ate 180d do onboarding coexistence). A Meta entrega
        //    em chunks/fases (varios webhooks); cada invocacao trata um pedaco.
        //    Grava com is_history=true (coluna da migration 070) + skipSideEffects.
        //    FLAG-DAY: sem a 070 aplicada, so estes inserts falham; o inbound
        //    normal segue intacto (mensagens normais nao referenciam a coluna).
        if (Array.isArray(value.history)) {
          for (const h of value.history) {
            await processHistory(url, key, resolved, h)
          }
        }

        // 6. smb_app_state_sync (contatos): nesta onda apenas logar/contar (V1.3).
        if (change.field === 'smb_app_state_sync') {
          const n = Array.isArray(value.contacts) ? value.contacts.length : 0
          console.log(`[cloud-api-inbound] smb_app_state_sync recebido (V1.3, so log): ${n} contato(s), company=${resolved.companyId}`)
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

    const { messageType, content, fileUrl, fileName, fileMimeType } =
      await normalizeCloudApiContent(url, key, resolved, m)

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
      cloudApiNumberId: resolved.id,
      adContext,
      profilePicUrl: null,
    })

    console.log(`[cloud-api-inbound] processed: leadId=${result.leadId}, isNew=${result.isNewLead}, wamid=${m.id}`)
  } catch (err) {
    console.error('[cloud-api-inbound] processMessage error:', err)
  }
}

/**
 * Normaliza o conteudo de uma mensagem/eco da Cloud API (tipo + texto + midia)
 * para os campos de InboundParams. Compartilhada por processMessage (inbound do
 * contato) e processEcho (echo do dono) para os dois nao divergirem.
 * Tipos fora do CHECK do banco caem para 'text' (igual evolution-inbound).
 */
async function normalizeCloudApiContent(
  url: string,
  key: string,
  resolved: ResolvedNumber,
  // deno-lint-ignore no-explicit-any
  m: any,
  opts: { skipMedia?: boolean } = {},
): Promise<{ messageType: string; content: string; fileUrl: string | null; fileName: string | null; fileMimeType: string | null }> {
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
      // History (skipMedia): nao baixa a midia (pode estar expirada e o volume
      // travaria o webhook). Preserva tipo/caption/mime; a midia fica sem URL.
      if (media?.id && token && !opts.skipMedia) {
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

  const validTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact']
  if (!validTypes.includes(messageType)) {
    console.warn(`[cloud-api-inbound] tipo '${messageType}' desconhecido, fallback para text`)
    messageType = 'text'
  }

  return { messageType, content, fileUrl, fileName, fileMimeType }
}

/**
 * Processa um smb_message_echoes[]: mensagem que o DONO do numero mandou pelo
 * app WhatsApp Business (coexistence). Entra no inbox como sender_type='human'
 * do lead cujo telefone e `to`, SEM disparar SDR/automacao/auto-reply/deal
 * (skipSideEffects=true).
 *
 * V1.4 anti-dup: external_id=wamid. O handler dedupa por external_id, entao o
 * eco das mensagens que NOS mesmos enviamos via Cloud API (ja gravadas com
 * external_id=wamid pelo whatsapp-send) cai no dedupe e nao vira INSERT novo.
 *
 * D-V1: edit/revoke apenas registrados (log), sem tratamento a fundo nesta onda.
 */
async function processEcho(
  url: string,
  key: string,
  resolved: ResolvedNumber,
  // deno-lint-ignore no-explicit-any
  m: any,
): Promise<void> {
  try {
    if (m.type === 'revoke' || m.type === 'edit') {
      console.log(`[cloud-api-inbound] echo '${m.type}' registrado (nao tratado, D-V1): wamid=${m.id}`)
      return
    }

    // No echo, o destinatario (o lead) e `to`; `from` e o proprio numero da empresa.
    const phone = normalizePhoneBR(m.to)
    if (!phone) {
      console.warn(`[cloud-api-inbound] echo sem 'to' valido: wamid=${m.id}`)
      return
    }

    const { messageType, content, fileUrl, fileName, fileMimeType } =
      await normalizeCloudApiContent(url, key, resolved, m)

    const result = await handleInboundMessage({
      supabaseUrl: url,
      supabaseKey: key,
      companyId: resolved.companyId,
      phone,
      senderName: null, // echo nao traz o profile do destinatario
      content,
      messageType,
      externalId: m.id ?? null,
      fileUrl,
      fileName,
      fileMimeType,
      source: 'whatsapp',
      instanceName: resolved.instanceLabel,
      cloudApiNumberId: resolved.id,
      adContext: null,
      profilePicUrl: null,
      senderType: 'human',   // o dono mandou pelo app
      skipSideEffects: true, // nao acionar SDR/automacao/auto-reply/deal
    })

    console.log(`[cloud-api-inbound] echo processed: leadId=${result.leadId}, isNew=${result.isNewLead}, wamid=${m.id}`)
  } catch (err) {
    console.error('[cloud-api-inbound] processEcho error:', err)
  }
}

/**
 * Processa um item de `history` (dump de ate 180d do onboarding coexistence).
 * Estrutura: history[].threads[].messages[]. O telefone do lead e o id da thread
 * (o contato); o sender_type de cada mensagem e derivado de quem enviou
 * (from == contato -> 'lead', senao a empresa -> 'human'). Grava com
 * is_history=true (coluna da migration 070) + skipSideEffects=true. Best-effort
 * por mensagem: erro numa nao derruba as demais nem o 200.
 *
 * FLAG-DAY: is_history e coluna da 070; o PVO desta frente espera a 070 aplicada
 * pelo Toni. Midia nao e baixada aqui (skipMedia) para nao travar o webhook.
 */
async function processHistory(
  url: string,
  key: string,
  resolved: ResolvedNumber,
  // deno-lint-ignore no-explicit-any
  h: any,
): Promise<void> {
  const threads = Array.isArray(h?.threads) ? h.threads : []
  for (const thread of threads) {
    const leadPhone = normalizePhoneBR(thread?.id ?? '')
    if (!leadPhone) {
      console.warn('[cloud-api-inbound] history thread sem id valido, pulando')
      continue
    }

    const messages = Array.isArray(thread?.messages) ? thread.messages : []
    for (const m of messages) {
      try {
        // edit/revoke historicos: so registrar (D-V1)
        if (m.type === 'revoke' || m.type === 'edit') {
          console.log(`[cloud-api-inbound] history '${m.type}' registrado (D-V1): wamid=${m.id}`)
          continue
        }

        // Quem enviou: from == contato (leadPhone) -> 'lead'; senao a empresa -> 'human'
        const senderType: 'lead' | 'human' =
          normalizePhoneBR(m.from ?? '') === leadPhone ? 'lead' : 'human'

        const { messageType, content, fileUrl, fileName, fileMimeType } =
          await normalizeCloudApiContent(url, key, resolved, m, { skipMedia: true })

        await handleInboundMessage({
          supabaseUrl: url,
          supabaseKey: key,
          companyId: resolved.companyId,
          phone: leadPhone,
          senderName: null,
          content,
          messageType,
          externalId: m.id ?? null,
          fileUrl,
          fileName,
          fileMimeType,
          source: 'whatsapp',
          instanceName: resolved.instanceLabel,
          cloudApiNumberId: resolved.id,
          adContext: null,
          profilePicUrl: null,
          senderType,
          skipSideEffects: true,
          isHistory: true,
        })
      } catch (err) {
        console.error('[cloud-api-inbound] processHistory message error:', err)
      }
    }
  }
}

// Normaliza o event do status_update para o CHECK de whatsapp_templates.status.
// Retorna null para event inesperado (nesse caso NAO atualiza, pra nao regredir
// um APPROVED com fallback errado; o Sincronizar reconcilia depois).
const TEMPLATE_STATUS_MAP: Record<string, string> = {
  PENDING: 'IN_REVIEW',
  PENDING_REVIEW: 'IN_REVIEW',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
}

function normTemplateStatus(raw: unknown): string | null {
  const key = typeof raw === 'string' ? raw.toUpperCase() : ''
  return TEMPLATE_STATUS_MAP[key] ?? null
}

/**
 * (Bloco d) Reflete message_template_status_update em veltzy.whatsapp_templates.
 * Best-effort e ISOLADO do fluxo de mensagens (nao usa phone_number_id nem guard
 * de provider). Chave do UPDATE: meta_template_id (globalmente unico na Meta).
 * Fallback SO se o id nao vier: company_id (resolvido por waba_id) + name +
 * language, nunca so name+language, pra nao tocar a linha de outra empresa.
 * Qualidade NAO entra aqui (vem em message_template_quality_update, outro field).
 *
 * Parsing defensivo (webhook em v26.0): le message_template_id/name/language,
 * event e reason; se o shape divergir, casa 0 linhas e loga (nao quebra nada).
 */
async function processTemplateStatusUpdate(
  // deno-lint-ignore no-explicit-any
  supabaseVeltzy: any,
  wabaId: string | undefined,
  // deno-lint-ignore no-explicit-any
  value: any,
): Promise<void> {
  try {
    const metaId = value?.message_template_id != null ? String(value.message_template_id) : null
    const name = value?.message_template_name ?? null
    const language = value?.message_template_language ?? null
    const status = normTemplateStatus(value?.event)
    const reason = value?.reason ?? value?.rejected_reason ?? null

    if (!status) {
      console.warn(`[cloud-api-inbound] template_status_update: event inesperado '${value?.event}', ignorando`)
      return
    }

    // deno-lint-ignore no-explicit-any
    const patch: Record<string, any> = { status, updated_at: new Date().toISOString() }
    if (status === 'REJECTED') patch.rejected_reason = reason

    let query
    if (metaId) {
      // meta_template_id e globalmente unico -> ja isola o tenant sozinho.
      query = supabaseVeltzy.from('whatsapp_templates').update(patch).eq('meta_template_id', metaId)
    } else {
      if (!wabaId || !name || !language) {
        console.warn('[cloud-api-inbound] template_status_update sem id nem (waba+name+language), ignorando')
        return
      }
      const { data: num } = await supabaseVeltzy
        .from('cloud_api_numbers')
        .select('company_id')
        .eq('waba_id', wabaId)
        .limit(1)
        .maybeSingle()
      if (!num?.company_id) {
        console.warn(`[cloud-api-inbound] template_status_update: waba ${wabaId} nao mapeado, ignorando`)
        return
      }
      // v26.0 manda language com hifen (pt-BR); o banco grava com underscore
      // (pt_BR, como o create/list). Normaliza pra o fallback casar a linha.
      const languageNorm = typeof language === 'string' ? language.replace(/-/g, '_') : language
      query = supabaseVeltzy
        .from('whatsapp_templates')
        .update(patch)
        .eq('company_id', num.company_id)
        .eq('name', name)
        .eq('language', languageNorm)
    }

    const { data: rows, error } = await query.select('id')
    if (error) {
      console.error('[cloud-api-inbound] template_status_update update erro:', error.message)
      return
    }
    const n = Array.isArray(rows) ? rows.length : 0
    if (n === 0) {
      console.warn(`[cloud-api-inbound] template_status_update: nenhum template casou (metaId=${metaId}, name=${name}), ignorando`)
    } else {
      console.log(`[cloud-api-inbound] template_status_update: ${n} linha(s) -> status=${status}`)
    }
  } catch (err) {
    console.error('[cloud-api-inbound] processTemplateStatusUpdate error:', err)
  }
}
