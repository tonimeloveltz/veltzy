import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { WahaHubProvider } from '../_shared/providers/waha-hub.ts'
import { prospectCreateLeadDeal } from '../_shared/prospect-create-lead-deal.ts'

// Envio da DM de prospeccao. DOIS modos (verify_jwt=true, service e JWT passam):
//  - AUTO (service_role, chamado pelo prospect-process-windows): exige dm_auto_enabled=true.
//  - MANUAL (JWT de usuario pela UI): valida admin/super_admin; IGNORA dm_auto_enabled.
// shadow_mode=true BLOQUEIA os dois. Agnostico ao texto: recebe {signal_id, message_text}.
// TRAVA LGPD: message_text precisa conter opt-out (SAIR|PARE), senao 'blocked'.
// Guardrails em AMBOS antes de enviar. Envio via Hub waha-send-message (sessao dedicada).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type BlockReason =
  | 'shadow_mode' | 'company_disabled' | 'globally_disabled' | 'dm_auto_disabled'
  | 'no_phone' | 'opt_out' | 'already_contacted' | 'outside_hours' | 'daily_cap' | 'too_soon'
  | 'no_session' | 'no_criteria_group'

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function withinBusinessHours(bh: { start?: string; end?: string; tz?: string } | null): boolean {
  if (!bh?.start || !bh?.end) return true
  const tz = bh.tz || 'America/Sao_Paulo'
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const [h, m] = hhmm.split(':').map(Number)
  const [sh, sm] = bh.start.split(':').map(Number)
  const [eh, em] = bh.end.split(':').map(Number)
  const cur = h * 60 + m
  return cur >= sh * 60 + sm && cur <= eh * 60 + em
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405, headers)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401, headers)
  const token = authHeader.replace('Bearer ', '')
  const isServiceRole = token === SERVICE_ROLE

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const body = await req.json() as { signal_id?: string; message_text?: string }
    const signalId = body.signal_id
    const messageText = (body.message_text ?? '').trim()
    if (!signalId || !messageText) {
      return json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'signal_id e message_text obrigatorios' } }, 400, headers)
    }

    // TRAVA LGPD: toda DM precisa conter o opt-out. Nao confia so em quem compos.
    if (!/\b(sair|pare)\b/i.test(messageText)) {
      return json({ ok: false, blocked: true, reason: 'missing_optout', message: 'message_text precisa conter o opt-out (SAIR/PARE)' }, 200, headers)
    }

    // Sinal (fonte da verdade do company_id/telefone/grupo).
    const { data: signal } = await supabase
      .from('prospect_signals')
      .select('id, company_id, group_id, author_identifier, author_phone_resolved, snippet, category')
      .eq('id', signalId)
      .maybeSingle()
    if (!signal) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'sinal nao encontrado' } }, 404, headers)
    const companyId: string = signal.company_id

    // --- Auth por modo ---
    if (!isServiceRole) {
      // MANUAL: JWT de usuario admin/super_admin, da MESMA empresa (super_admin cross-company).
      const { data: userData, error: authErr } = await supabasePublic.auth.getUser(token)
      if (authErr || !userData?.user) return json({ ok: false, error: 'Invalid token' }, 401, headers)
      const userId = userData.user.id
      const { data: roleRows } = await supabasePublic.from('user_roles').select('role').eq('user_id', userId)
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
      const isSuper = roles.includes('super_admin')
      const isAdmin = roles.includes('admin')
      if (!isSuper && !isAdmin) return json({ ok: false, error: 'Forbidden' }, 403, headers)
      if (!isSuper) {
        const { data: profile } = await supabasePublic.from('profiles').select('company_id').eq('user_id', userId).maybeSingle()
        if (profile?.company_id !== companyId) return json({ ok: false, error: 'Forbidden' }, 403, headers)
      }
    }

    // --- Config + guardrails ---
    const { data: cfg } = await supabase
      .from('prospect_config')
      .select('is_enabled, shadow_mode, dm_auto_enabled, daily_dm_cap, business_hours, min_interval_seconds')
      .eq('company_id', companyId)
      .maybeSingle()

    const block = (reason: BlockReason) => json({ ok: false, blocked: true, reason }, 200, headers)

    if (cfg?.shadow_mode !== false) return block('shadow_mode')           // default true = bloqueia
    if (cfg?.is_enabled !== true) return block('company_disabled')
    if (isServiceRole && cfg?.dm_auto_enabled !== true) return block('dm_auto_disabled')

    // kill switch global (public.system_flags = key/value jsonb)
    const { data: flag } = await supabasePublic.from('system_flags').select('value').eq('key', 'prospect_globally_enabled').maybeSingle()
    if (flag?.value !== true) return block('globally_disabled')

    // telefone DM-able (resolvido no V2); sem telefone nao ha envio (V4 trata como alerta)
    const phone = signal.author_phone_resolved
    if (!phone) return block('no_phone')

    // opt-out do lead (se existir por phone). person_key PADRONIZADO = sha256(phone
    // normalizado) em todo lugar (V2 prefilter/responded + aqui); o vinculo com o
    // lead vive em signal.lead_id. A checagem de 1-contato e a RESERVA ATOMICA abaixo.
    const { data: existingLead } = await supabase.from('leads').select('marketing_opt_out').eq('company_id', companyId).eq('phone', phone).maybeSingle()
    if (existingLead?.marketing_opt_out === true) return block('opt_out')
    const personKey = await sha256Hex(normalizePhoneBR(phone))

    // horario comercial
    if (!withinBusinessHours(cfg?.business_hours ?? null)) return block('outside_hours')

    // teto do dia: conta DMs enviadas nas ultimas 24h (proxy de "do dia"; a rampa
    // semanal depende de start-date que o schema nao tem -> usa daily_dm_cap).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: sentCount } = await supabase
      .from('prospect_dm_log')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'sent').gte('created_at', since)
    const cap = cfg?.daily_dm_cap ?? 3
    if ((sentCount ?? 0) >= cap) return block('daily_cap')

    // intervalo minimo desde a ultima DM enviada
    const minInterval = cfg?.min_interval_seconds ?? 120
    const { data: lastDm } = await supabase
      .from('prospect_dm_log').select('sent_at').eq('company_id', companyId).eq('status', 'sent')
      .not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1).maybeSingle()
    if (lastDm?.sent_at && (Date.now() - new Date(lastDm.sent_at).getTime()) < minInterval * 1000) {
      return block('too_soon')
    }

    // sessao dedicada (do grupo do sinal)
    const { data: group } = await supabase.from('prospect_groups').select('session_name, name').eq('id', signal.group_id).maybeSingle()
    const sessionName: string | null = group?.session_name ?? null
    if (!sessionName) return block('no_session')

    // RESERVA ATOMICA do contato = mutex "1 DM por pessoa pra sempre". Feita DEPOIS de
    // todos os outros guardrails (pra nao queimar o tiro em bloqueio transitorio) e ANTES
    // do envio. unique(company_id, person_key) e o lock: se nao inseriu (conflito), ja
    // foi contatado -> bloqueia. Se o envio falhar, a reserva e desfeita (permite retry).
    const { data: reserved } = await supabase.from('prospect_contacted')
      .upsert({ company_id: companyId, person_key: personKey, responded: false }, { onConflict: 'company_id,person_key', ignoreDuplicates: true })
      .select('id')
    if (!reserved || reserved.length === 0) return block('already_contacted')

    // --- Envio ---
    const { data: dmLog } = await supabase.from('prospect_dm_log').insert({
      company_id: companyId,
      signal_id: signalId,
      session_name: sessionName,
      to_phone: phone,
      to_identifier: signal.author_identifier,
      message_text: messageText,
      status: 'queued',
    }).select('id').single()

    try {
      const provider = new WahaHubProvider()
      const result = await provider.sendMessage(
        { id: '', company_id: companyId, provider: 'waha', status: 'connected', phone_number: null, qr_code: null, connected_at: null, metadata: {} },
        { phone, content: messageText, type: 'text', sessionName, companyId },
      )

      // contato+deal pela funcao estreita (lead upsert + deal; sem messages/SDR/SLA/fila).
      // A reserva em prospect_contacted ja foi feita acima (mutex) — nao re-grava aqui.
      const { leadId, dealId } = await prospectCreateLeadDeal({
        supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_ROLE,
        companyId, phone, name: null, sessionName, groupName: group?.name ?? null,
        pipelineId: await resolvePipelineId(supabase, companyId), sourceId: await resolveSourceId(supabase, companyId),
      })

      await supabase.from('prospect_dm_log').update({
        status: 'sent', waha_external_id: result.externalId ?? null, sent_at: new Date().toISOString(),
      }).eq('id', dmLog?.id)

      await supabase.from('prospect_signals').update({ lead_id: leadId, deal_id: dealId, status: 'sent' }).eq('id', signalId)

      return json({ ok: true, sent: true, lead_id: leadId, deal_id: dealId, external_id: result.externalId ?? null }, 200, headers)
    } catch (sendErr) {
      // Envio falhou: desfaz a reserva (a pessoa NAO foi contatada de fato) -> permite retry.
      await supabase.from('prospect_contacted').delete().eq('company_id', companyId).eq('person_key', personKey)
      await supabase.from('prospect_dm_log').update({
        status: 'failed', error: (sendErr as Error).message,
      }).eq('id', dmLog?.id)
      return json({ ok: false, error: { code: 'SEND_FAILED', message: (sendErr as Error).message } }, 502, headers)
    }
  } catch (err) {
    console.error('[prospect-dm-send]', err)
    return json({ ok: false, error: (err as Error).message }, 500, headers)
  }
})

// deno-lint-ignore no-explicit-any
async function resolvePipelineId(supabase: any, companyId: string): Promise<string> {
  const { data } = await supabase.from('pipelines').select('id').eq('company_id', companyId).eq('name', 'Prospecção grupos').maybeSingle()
  if (!data?.id) throw new Error('pipeline "Prospecção grupos" nao encontrada')
  return data.id
}
// deno-lint-ignore no-explicit-any
async function resolveSourceId(supabase: any, companyId: string): Promise<string | null> {
  const { data } = await supabase.from('lead_sources').select('id').eq('company_id', companyId).eq('slug', 'grupo-whatsapp').maybeSingle()
  return data?.id ?? null
}
