const allowedOrigins = [
  'https://hub.veltz.group',
  'https://develop.hub.veltz.group',
  'https://app.veltzy.com',
  'https://develop.veltzy.com',
  'https://develop.app.veltzy.com',
  'http://localhost:5173',
]

// Previews do Vercel do nosso time (subdominio dinamico por deploy). Escopado ao
// projeto weveltzgroup; o gate de auth (JWT/segredo) das functions nao muda.
const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+-weveltzgroup-8791s-projects\.vercel\.app$/

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const isVercelPreview = VERCEL_PREVIEW_RE.test(origin)
  const allowed = (allowedOrigins.includes(origin) || isVercelPreview) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    // Superset dos headers usados por qualquer function (browser so envia os que
    // precisa; webhooks/cron sao server-to-server e nem fazem preflight).
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-hub-secret, x-hub-signature-256, z-api-token',
  }
}
