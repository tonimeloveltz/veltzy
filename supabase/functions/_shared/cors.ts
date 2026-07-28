const allowedOrigins = [
  'https://hub.veltz.group',
  'https://develop.hub.veltz.group',
  'https://app.veltzy.com',
  'https://develop.veltzy.com',
  'https://develop.app.veltzy.com',
  'http://localhost:5173',
]

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Retrocompatibilidade: wildcard para funcoes que ainda usam corsHeaders diretamente
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
