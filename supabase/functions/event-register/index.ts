// event-register: inscricao publica (pagina /e/:slug). verify_jwt = false.
// Ordem: envelope -> honeypot -> tempo minimo -> evento -> rate limit -> campos -> RPC.
// A RPC register_for_event trava o evento (FOR UPDATE) e decide vaga, duplicidade e janela.

import { getCorsHeaders } from '../_shared/cors.ts'
import { serviceClients } from '../_shared/events/clients.ts'
import { clientIp, hashIp } from '../_shared/events/ip-hash.ts'
import {
  json, kickDispatcher, loadEventForRegistration, pendingConfirmationId, prepareRegistration,
  registerEnvelope, runInBackground,
} from '../_shared/events/register-core.ts'

const MIN_FILL_MS = 3000
const CLOSED_RESULTS = new Set(['sold_out', 'closed', 'not_open', 'finished', 'canceled'])

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, cors, 405)

  const raw = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return json({ result: 'rejected' }, cors, 400)

  // Anti-bot antes de qualquer leitura no banco.
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return json({ result: 'rejected' }, cors, 400)
  const renderedAt = Number(raw.rendered_at)
  if (!Number.isFinite(renderedAt) || Date.now() - renderedAt < MIN_FILL_MS) {
    return json({ result: 'rejected' }, cors, 400)
  }

  const parsed = registerEnvelope.safeParse(raw)
  const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : ''
  if (!parsed.success || !slug) return json({ result: 'validation', errors: { _envelope: 'invalid' } }, cors, 422)

  try {
    const { veltzy, pub } = serviceClients()

    const ev = await loadEventForRegistration(veltzy, pub, { slug })
    if (!ev) return json({ result: 'not_found' }, cors, 404)

    const salt = Deno.env.get('EVENT_IP_SALT')
    if (!salt) throw new Error('EVENT_IP_SALT ausente')
    const ipHash = await hashIp(clientIp(req.headers), salt)
    const { data: allowed, error: rlError } = await veltzy.rpc('event_rate_limit_hit', {
      p_event_id: ev.id, p_ip_hash: ipHash,
    })
    if (rlError) throw rlError
    if (allowed === false) return json({ result: 'rate_limited' }, cors, 429)

    const prepared = prepareRegistration(ev, parsed.data, {
      source: 'public_form',
      ip_hash: ipHash,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
    })
    if (!prepared.ok) return json({ result: 'validation', errors: prepared.errors }, cors, 422)

    const { data, error } = await veltzy.rpc('register_for_event', { p_payload: prepared.payload })
    if (error) throw error
    const res = data as { result: string; registration_id?: string; public_token?: string; errors?: Record<string, string> }

    switch (res.result) {
      case 'ok': {
        if (res.registration_id) {
          const messageId = await pendingConfirmationId(veltzy, res.registration_id)
          if (messageId) runInBackground(kickDispatcher(messageId))
        }
        return json({ result: 'ok', token: res.public_token }, cors)
      }
      case 'duplicate': {
        // reenvia a confirmacao para o WhatsApp ja inscrito; o token NUNCA volta aqui
        if (res.registration_id) {
          const { data: queued } = await veltzy.rpc('enqueue_duplicate_resend', { p_registration_id: res.registration_id })
          if (queued === true) {
            const { data: msg } = await veltzy.from('event_messages').select('id')
              .eq('registration_id', res.registration_id).eq('kind', 'duplicate_resend').eq('status', 'pending')
              .order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (msg?.id) runInBackground(kickDispatcher(msg.id as string))
          }
        }
        return json({ result: 'duplicate' }, cors)
      }
      case 'validation':
        return json({ result: 'validation', errors: res.errors ?? {} }, cors, 422)
      case 'not_found':
        return json({ result: 'not_found' }, cors, 404)
      default:
        if (CLOSED_RESULTS.has(res.result)) return json({ result: res.result }, cors)
        console.error('[event-register] resultado inesperado', res.result)
        return json({ error: 'internal' }, cors, 500)
    }
  } catch (err) {
    console.error('[event-register]', err)
    return json({ error: 'internal' }, cors, 500)
  }
})
