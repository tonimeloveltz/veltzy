// event-admin-register: "Adicionar inscrito" da tabela de inscritos. verify_jwt = true.
// So admin, manager ou super_admin da empresa do evento. Sem honeypot e sem tempo minimo;
// passa por cima de vaga e janela (decisao do admin) e nunca marca consentimento de marketing.

import { getCorsHeaders } from '../_shared/cors.ts'
import { serviceClients } from '../_shared/events/clients.ts'
import {
  json, kickDispatcher, loadEventForRegistration, pendingConfirmationId, prepareRegistration,
  registerEnvelope, runInBackground,
} from '../_shared/events/register-core.ts'

const PRIVILEGED = ['admin', 'manager', 'super_admin']

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, cors, 405)

  try {
    const { veltzy, pub } = serviceClients()

    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data: { user } } = await pub.auth.getUser(jwt)
    if (!user) return json({ error: 'unauthorized' }, cors, 401)

    const { data: profile } = await pub.from('profiles').select('id, company_id').eq('user_id', user.id).maybeSingle()
    if (!profile) return json({ error: 'forbidden' }, cors, 403)
    const { data: roles } = await pub.from('user_roles').select('role, company_id').eq('user_id', user.id)
    const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin')
    const isPrivileged = isSuperAdmin ||
      (roles ?? []).some((r) => PRIVILEGED.includes(r.role) && r.company_id === profile.company_id)
    if (!isPrivileged) return json({ error: 'forbidden' }, cors, 403)

    const raw = await req.json().catch(() => null) as Record<string, unknown> | null
    const eventId = typeof raw?.event_id === 'string' ? raw.event_id : ''
    const parsed = registerEnvelope.safeParse({ ...(raw ?? {}), consent_marketing: false })
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(eventId)) {
      return json({ result: 'validation', errors: { _envelope: 'invalid' } }, cors, 422)
    }

    const ev = await loadEventForRegistration(veltzy, pub, { id: eventId })
    // empresa do evento = empresa do usuario, inclusive para super_admin (a RPC exige ator do tenant)
    if (!ev || ev.company_id !== profile.company_id) {
      return json({ result: 'not_found' }, cors, 404)
    }

    const prepared = prepareRegistration(ev, parsed.data, {
      source: 'manual',
      actor_profile_id: profile.id,
      consent_marketing: false,
    })
    if (!prepared.ok) return json({ result: 'validation', errors: prepared.errors }, cors, 422)

    const { data, error } = await veltzy.rpc('register_for_event', { p_payload: prepared.payload })
    if (error) throw error
    const res = data as { result: string; registration_id?: string; errors?: Record<string, string> }

    if (res.result === 'ok' && res.registration_id) {
      const messageId = await pendingConfirmationId(veltzy, res.registration_id)
      if (messageId) runInBackground(kickDispatcher(messageId))
      return json({ result: 'ok', registration_id: res.registration_id }, cors)
    }
    if (res.result === 'validation') return json({ result: 'validation', errors: res.errors ?? {} }, cors, 422)
    // duplicate devolve o id: o admin ja ve a inscricao na tabela
    return json({ result: res.result, registration_id: res.registration_id }, cors, res.result === 'forbidden' ? 403 : 200)
  } catch (err) {
    console.error('[event-admin-register]', err)
    return json({ error: 'internal' }, cors, 500)
  }
})
