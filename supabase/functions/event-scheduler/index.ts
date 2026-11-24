// event-scheduler: chamado pelo pg_cron a cada 5 min (veltzy.invoke_event_scheduler).
// verify_jwt = false, protegida por isCronAuthorized. Roda o tick (fecha janela vencida,
// enfileira lembrete D-1, encerra evento, devolve 'sending' preso) e depois esvazia a fila.

import { getCorsHeaders } from '../_shared/cors.ts'
import { serviceClients } from '../_shared/events/clients.ts'
import { cronUnauthorized, isCronAuthorized } from '../_shared/cron-auth.ts'
import { runDispatch } from '../_shared/events/dispatch.ts'
import { json } from '../_shared/events/register-core.ts'

const BUDGET_MS = 120_000

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!isCronAuthorized(req)) return cronUnauthorized(cors)

  try {
    const { veltzy, pub } = serviceClients()

    const { data: tick, error } = await veltzy.rpc('events_scheduler_tick')
    if (error) throw error

    const dispatch = await runDispatch(veltzy, pub, { budgetMs: BUDGET_MS })
    return json({ ok: true, tick, dispatch }, cors)
  } catch (err) {
    console.error('[event-scheduler]', err)
    return json({ error: 'internal' }, cors, 500)
  }
})
