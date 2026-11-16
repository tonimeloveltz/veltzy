// event-dispatcher: envia a fila de mensagens de evento pela sessao WAHA do evento.
// verify_jwt = false, protegida por isCronAuthorized (service key ou x-cron-secret).
// Corpo opcional { message_id } para disparar uma mensagem so (confirmacao logo apos a inscricao).

import { getCorsHeaders } from '../_shared/cors.ts'
import { serviceClients } from '../_shared/events/clients.ts'
import { cronUnauthorized, isCronAuthorized } from '../_shared/cron-auth.ts'
import { runDispatch } from '../_shared/events/dispatch.ts'
import { json } from '../_shared/events/register-core.ts'

const BUDGET_MS = 60_000

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!isCronAuthorized(req)) return cronUnauthorized(cors)

  try {
    const body = await req.json().catch(() => ({})) as { message_id?: unknown }
    const messageId = typeof body.message_id === 'string' ? body.message_id : null
    const { veltzy, pub } = serviceClients()
    const summary = await runDispatch(veltzy, pub, { messageId, budgetMs: BUDGET_MS })
    return json({ ok: true, ...summary }, cors)
  } catch (err) {
    console.error('[event-dispatcher]', err)
    return json({ error: 'internal' }, cors, 500)
  }
})
