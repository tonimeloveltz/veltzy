// event-registration: pagina da inscricao (/e/:slug/i/:token). verify_jwt = false.
// GET ?token= le; POST { token, action: 'confirm' | 'cancel' } confirma ou cancela.
// O token (32 bytes aleatorios) e a credencial: quem tem o link gerencia a inscricao.

import { getCorsHeaders } from '../_shared/cors.ts'
import { serviceClients } from '../_shared/events/clients.ts'
import { withAssetUrls } from '../_shared/events/public-urls.ts'
import { json } from '../_shared/events/register-core.ts'

const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { veltzy } = serviceClients()

    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? ''
      if (!TOKEN_RE.test(token)) return json({ error: 'not_found' }, cors, 404)
      const { data, error } = await veltzy.rpc('get_registration_public', { p_token: token })
      if (error) throw error
      if (!data) return json({ error: 'not_found' }, cors, 404)
      const reg = data as { event: Record<string, unknown> } & Record<string, unknown>
      reg.event = { ...reg.event, appearance: withAssetUrls(reg.event.appearance as Record<string, unknown>) }
      return json(reg, cors, 200, { 'Cache-Control': 'no-store' })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as { token?: unknown; action?: unknown } | null
      const token = typeof body?.token === 'string' ? body.token : ''
      const action = body?.action
      if (!TOKEN_RE.test(token) || (action !== 'confirm' && action !== 'cancel')) {
        return json({ result: 'invalid' }, cors, 400)
      }
      const fn = action === 'confirm' ? 'confirm_registration' : 'cancel_registration'
      const { data, error } = await veltzy.rpc(fn, { p_token: token })
      if (error) throw error
      const result = (data as { result: string }).result
      return json({ result }, cors, result === 'not_found' ? 404 : 200)
    }

    return json({ error: 'method_not_allowed' }, cors, 405)
  } catch (err) {
    console.error('[event-registration]', err)
    return json({ error: 'internal' }, cors, 500)
  }
})
