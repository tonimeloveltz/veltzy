import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'
import { cronUnauthorized, isCronAuthorized } from '../_shared/cron-auth.ts'
import { guardarSegredo, instagramTokenSecretName, lerSegredo } from '../_shared/vault-secret.ts'
import { graphRequest, INSTAGRAM_GRAPH_HOST, isTokenInvalid } from '../_shared/instagram-graph.ts'

// Instagram DM, Onda 1 (Spec 5.4, PRD D8): renova o token de longa duracao
// (60 dias) antes de expirar. Disparado por pg_cron diario. A Meta so aceita
// renovar token com mais de 24h.

const DAY_MS = 24 * 60 * 60 * 1000
const REFRESH_BEFORE_MS = 15 * DAY_MS
const MIN_TOKEN_AGE_MS = DAY_MS
const DEFAULT_EXPIRES_IN_S = 60 * 24 * 60 * 60

interface RefreshResponse {
  access_token?: string
  expires_in?: number
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // A5: so scheduler autenticado (service key ou x-cron-secret) dispara.
  if (!isCronAuthorized(req)) return cronUnauthorized(corsHeaders)

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key)

    const now = new Date()
    const { data: rows, error } = await supabase
      .from('instagram_connections')
      .select('id, company_id, token_refreshed_at')
      .eq('is_active', true)
      .eq('auth_flow', 'instagram_login')
      .in('status', ['active', 'error'])
      .lt('token_expires_at', new Date(now.getTime() + REFRESH_BEFORE_MS).toISOString())
    if (error) throw new Error(`Falha ao listar conexoes: ${error.message}`)

    const minRefreshedAt = now.getTime() - MIN_TOKEN_AGE_MS
    const candidates = (rows ?? []).filter((row) =>
      !row.token_refreshed_at || new Date(row.token_refreshed_at).getTime() < minRefreshedAt,
    )

    let refreshed = 0
    let failed = 0

    for (const row of candidates) {
      const updateConnection = (fields: Record<string, unknown>) =>
        supabase.from('instagram_connections').update(fields).eq('id', row.id)

      try {
        const secretName = instagramTokenSecretName(row.company_id)
        const current = await lerSegredo(supabasePublic, secretName)
        if (!current) {
          await updateConnection({ status: 'token_expired', last_error: 'Token ausente. Reconecte o Instagram.' })
          failed++
          continue
        }

        const result = await graphRequest<RefreshResponse>(`${INSTAGRAM_GRAPH_HOST}/refresh_access_token`, {
          query: { grant_type: 'ig_refresh_token', access_token: current },
        })

        if (!result.ok || !result.data.access_token) {
          const message = result.ok ? 'Resposta da Meta sem token' : result.error.message
          const expired = !result.ok && isTokenInvalid(result.error)
          await updateConnection(expired ? { status: 'token_expired', last_error: message } : { last_error: message })
          console.warn('[instagram-token-refresh] falha', { connectionId: row.id, expired, message })
          failed++
          continue
        }

        await guardarSegredo(supabasePublic, secretName, result.data.access_token)
        const expiresIn = typeof result.data.expires_in === 'number' ? result.data.expires_in : DEFAULT_EXPIRES_IN_S
        await updateConnection({
          token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
          token_refreshed_at: new Date().toISOString(),
          last_error: null,
        })
        refreshed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[instagram-token-refresh] erro', { connectionId: row.id, message })
        await updateConnection({ last_error: message })
        failed++
      }
    }

    return json({ checked: candidates.length, refreshed, failed })
  } catch (err) {
    console.error('[instagram-token-refresh] error:', err instanceof Error ? err.message : String(err))
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500)
  }
})
