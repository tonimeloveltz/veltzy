import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { isOptOutMessage } from '../_shared/optout-detect.ts'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { prefilterGroupMessage } from '../_shared/prospect-prefilter.ts'
import { resolveAuthorFromPayload, stripJidSuffix, type WahaRawPayload } from '../_shared/prospect-phone-resolve.ts'

// Webhook da SESSAO DEDICADA de prospeccao. A WAHA posta AQUI direto (sem passar
// pelo waha-webhook-receiver do Hub, que pula grupos). Valida HMAC-SHA512 do corpo
// cru. Grupo (@g.us) -> prospect_group_messages_raw (dedup por engine). 1:1 (resposta
// a DM) -> handleInboundMessage (inbox, SEM SDR pela pipeline sem SDR) + opt-out.
// NUNCA grava mensagem de grupo como 1:1.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_HMAC = Deno.env.get('PROSPECT_WAHA_WEBHOOK_HMAC') ?? ''

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// HMAC-SHA512 do corpo CRU, hex, tempo constante. Header X-Webhook-Hmac ("sha512=<hex>" ou "<hex>").
async function verifyHmac(rawBody: string, header: string | null): Promise<boolean> {
  if (!header || !WEBHOOK_HMAC) return false
  const keyObj = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(WEBHOOK_HMAC), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', keyObj, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('')
  const received = (header.startsWith('sha512=') ? header.slice(7) : header).toLowerCase()
  return timingSafeEqual(received, expected)
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// Engine do nome da sessao (convencao H4: sufixo -webjs/-noweb); fallback prospect_config.engine.
function engineFromSession(sessionName: string, fallback: string | null): string | null {
  if (sessionName.endsWith('-webjs')) return 'webjs'
  if (sessionName.endsWith('-noweb')) return 'noweb'
  return fallback
}

// NOWEB nao manda `type`: deriva de location/vCards/hasMedia+mimetype (igual ao receiver do Hub).
function deriveMessageType(p: WahaRawPayload): string {
  if (p.location) return 'location'
  if (p.vCards) return 'contact'
  if (p.hasMedia && p.media?.mimetype) {
    const m = p.media.mimetype
    if (m.startsWith('image/')) return m.includes('webp') ? 'sticker' : 'image'
    if (m.startsWith('video/')) return 'video'
    if (m.startsWith('audio/')) return 'audio'
    return 'document'
  }
  return 'text'
}

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405, headers)

  // Corpo CRU primeiro (o HMAC exige o texto exato, antes do JSON.parse).
  const raw = await req.text()
  if (!WEBHOOK_HMAC) {
    console.error('[prospect-group-inbound] PROSPECT_WAHA_WEBHOOK_HMAC ausente')
    return json({ ok: false, error: 'config' }, 500, headers)
  }
  const hmacOk = await verifyHmac(raw, req.headers.get('X-Webhook-Hmac') ?? req.headers.get('x-webhook-hmac'))
  if (!hmacOk) return json({ ok: false, error: 'invalid hmac' }, 401, headers)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ ok: false, error: 'bad json' }, 400, headers)
  }

  try {
    const sessionName = String(body.session ?? '')
    const eventType = String(body.event ?? '')
    if (!sessionName || eventType !== 'message') {
      return json({ ok: true, skipped: true, reason: 'not_message' }, 200, headers)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Empresa pela sessao (waha_instances tem RLS super_admin; service_role bypassa).
    const { data: instance } = await supabasePublic
      .from('waha_instances').select('company_id').eq('session_name', sessionName).maybeSingle()
    if (!instance) return json({ ok: true, skipped: true, reason: 'no_waha_instance' }, 200, headers)
    const companyId: string = instance.company_id

    const { data: cfg } = await supabase
      .from('prospect_config').select('engine').eq('company_id', companyId).maybeSingle()
    const engine = engineFromSession(sessionName, cfg?.engine ?? null)

    const p = (body.payload ?? {}) as WahaRawPayload
    const key = p._data?.key ?? {}
    const fromMe = p.fromMe ?? key.fromMe ?? false
    const chatJid = String(p.from ?? key.remoteJid ?? '')
    const isGroup = chatJid.endsWith('@g.us')
    const messageId = String(key.id ?? p.id ?? '')
    const ts = Number(p.timestamp ?? p._data?.messageTimestamp ?? 0)
    const text = p.body ?? ''
    const receivedAt = ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString()

    if (!messageId) return json({ ok: true, skipped: true, reason: 'no_message_id' }, 200, headers)

    if (isGroup) {
      // ---------- GRUPO: raw + dedup por engine ----------
      const groupJid = chatJid
      const { data: group } = await supabase
        .from('prospect_groups').select('id').eq('company_id', companyId).eq('group_jid', groupJid).maybeSingle()
      const groupId: string | null = group?.id ?? null

      const author = resolveAuthorFromPayload(p)

      // Flags de prefilter que dependem do banco (so quando ha telefone resolvido).
      let alreadyContacted = false
      let leadOptedOut = false
      if (author.phone) {
        const personKey = await sha256Hex(author.phone)
        const { data: contacted } = await supabase
          .from('prospect_contacted').select('id').eq('company_id', companyId).eq('person_key', personKey).maybeSingle()
        alreadyContacted = !!contacted
        const { data: lead } = await supabase
          .from('leads').select('marketing_opt_out').eq('company_id', companyId).eq('phone', author.phone).maybeSingle()
        leadOptedOut = lead?.marketing_opt_out === true
      }

      const pf = prefilterGroupMessage({ text, hasMedia: !!p.hasMedia, fromMe, alreadyContacted, leadOptedOut })
      if (pf.skip) return json({ ok: true, skipped: true, reason: pf.reason }, 200, headers)

      // Upsert dedup por (company_id, group_jid, message_external_id, engine). select() devolve
      // a linha so quando INSERIU (ignoreDuplicates): usa isso pra incrementar messages_read 1x.
      const { data: inserted, error: upErr } = await supabase
        .from('prospect_group_messages_raw')
        .upsert({
          company_id: companyId,
          group_id: groupId,
          group_jid: groupJid,
          session_name: sessionName,
          engine,
          message_external_id: messageId,
          author_identifier: author.identifier,
          author_key: author.authorKey,
          author_phone_resolved: author.phone,
          text,
          window_context: null,
          classified: false,
          received_at: receivedAt,
        }, { onConflict: 'company_id,group_jid,message_external_id,engine', ignoreDuplicates: true })
        .select('id')
      if (upErr) throw upErr

      const didInsert = (inserted?.length ?? 0) > 0
      if (didInsert && groupId) {
        // Contador best-effort (PostgREST nao tem incremento atomico; Veltzy nao cria RPC/migration).
        const { data: g } = await supabase.from('prospect_groups').select('messages_read').eq('id', groupId).maybeSingle()
        await supabase.from('prospect_groups').update({ messages_read: (g?.messages_read ?? 0) + 1 }).eq('id', groupId)
      }

      return json({ ok: true, kind: 'group', stored: didInsert, resolved: !!author.phone }, 200, headers)
    }

    // ---------- 1:1 (resposta a DM): inbox via handler, SEM SDR ----------
    if (fromMe) return json({ ok: true, skipped: true, reason: 'from_self' }, 200, headers)

    // Telefone do remetente (NOWEB LID: remoteJidAlt; senao from/remoteJid).
    const senderJid = key.addressingMode === 'lid'
      ? (key.remoteJidAlt ?? '')
      : (p.from ?? key.remoteJid ?? '')
    const phone = normalizePhoneBR(stripJidSuffix(senderJid))
    if (!phone || phone.length < 12 || phone.length > 13) {
      return json({ ok: true, skipped: true, reason: 'invalid_phone' }, 200, headers)
    }

    // Anti-SDR determinístico: QUALQUER lead novo da sessão dedicada cai na pipeline
    // "Prospecção grupos" (sem SDR) + source grupo-whatsapp — não no default da empresa
    // (que pode ter SDR e a Iris responderia um prospect). Lead existente não muda.
    const [{ data: pipeline }, { data: leadSource }] = await Promise.all([
      supabase.from('pipelines').select('id').eq('company_id', companyId).eq('name', 'Prospecção grupos').maybeSingle(),
      supabase.from('lead_sources').select('id').eq('company_id', companyId).eq('slug', 'grupo-whatsapp').maybeSingle(),
    ])

    const messageType = deriveMessageType(p)
    const result = await handleInboundMessage({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SERVICE_ROLE,
      companyId,
      phone,
      senderName: p._data?.pushName ?? p.notifyName ?? null,
      content: text,
      messageType,
      externalId: messageId,
      fileUrl: p.media?.url ?? null,
      fileName: p.media?.filename ?? null,
      fileMimeType: p.media?.mimetype ?? null,
      source: 'whatsapp',
      instanceName: sessionName,
      whatsappProvider: 'waha',
      adContext: null,
      profilePicUrl: null,
      pipelineId: pipeline?.id ?? undefined,
      sourceId: leadSource?.id ?? undefined,
    })

    // Respondeu a DM -> marca prospect_contacted.responded. person_key pode ser
    // sha256(phone) (ainda nao virou lead) OU lead_id::text (ja virou): cobre os dois.
    // Opt-out (SAIR/PARE): o handler ja setou leads.marketing_opt_out; aqui fecha o
    // bloqueio no ledger de prospeccao (responded=true tambem sinaliza "nao recontatar").
    const personKey = await sha256Hex(phone)
    await supabase.from('prospect_contacted').update({ responded: true })
      .eq('company_id', companyId).eq('person_key', personKey)
    await supabase.from('prospect_contacted').update({ responded: true })
      .eq('company_id', companyId).eq('person_key', result.leadId)

    return json({
      ok: true,
      kind: 'dm',
      leadId: result.leadId,
      isNewLead: result.isNewLead,
      optOut: isOptOutMessage(text),
    }, 200, headers)
  } catch (err) {
    console.error('[prospect-group-inbound]', err)
    return json({ ok: false, error: (err as Error).message }, 500, headers)
  }
})
