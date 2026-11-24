// event-public: leitura publica do evento pelo slug (pagina /e/:slug).
// verify_jwt = false. Nunca devolve id de empresa, pipeline, etapa, tag, prioridade nem
// online_url: get_event_public ja monta o JSON so com o que e publico.

import { getCorsHeaders } from '../_shared/cors.ts'
import { serviceClients } from '../_shared/events/clients.ts'
import { withAssetUrls } from '../_shared/events/public-urls.ts'
import { json } from '../_shared/events/register-core.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, cors, 405)

  const slug = new URL(req.url).searchParams.get('slug')?.trim().toLowerCase() ?? ''
  // mesmo 404 para slug invalido, rascunho, inexistente e excluido
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return json({ error: 'not_found' }, cors, 404)

  try {
    const { veltzy } = serviceClients()
    const { data, error } = await veltzy.rpc('get_event_public', { p_slug: slug })
    if (error) throw error
    if (!data) return json({ error: 'not_found' }, cors, 404)

    const event = { ...(data as Record<string, unknown>) }
    event.appearance = withAssetUrls(event.appearance as Record<string, unknown>)
    return json(event, cors, 200, { 'Cache-Control': 'public, max-age=30' })
  } catch (err) {
    console.error('[event-public]', err)
    return json({ error: 'internal' }, cors, 500)
  }
})
