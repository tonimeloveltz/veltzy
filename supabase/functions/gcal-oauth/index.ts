/**
 * gcal-oauth: consentimento, troca de codigo e desconexao do Google Calendar.
 *
 * Copia estrutural de instagram-oauth: valida o Bearer, resolve o profile pelo
 * user.id e so entao instancia o client com service role. A conexao pertence ao
 * profile (o vendedor), nunca a empresa.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return json({ error: 'Google Calendar nao configurado neste ambiente' }, 503)
    }

    // Precisa bater exatamente com a URI cadastrada no Google Cloud Console.
    // Em desenvolvimento local, aponte APP_URL para http://localhost:5173.
    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.veltzy.com'
    const redirectUri = `${appUrl}/oauth/google/callback`

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('user_id', user.id)
      .single()
    if (!profile) return json({ error: 'Perfil nao encontrado' }, 403)

    const { action, code, state } = await req.json()

    if (action === 'authorize') {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        // Os dois juntos, sempre. Sem access_type=offline o Google nao devolve
        // refresh_token; sem prompt=consent ele deixa de devolver a partir da
        // segunda autorizacao. Faltando qualquer um, a conexao morre na
        // primeira expiracao, uma hora depois.
        access_type: 'offline',
        prompt: 'consent',
        state: state ?? '',
      })
      return json({ url: `${AUTH_URL}?${params.toString()}` })
    }

    if (action === 'callback') {
      if (!code) return json({ error: 'code obrigatorio' }, 400)

      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      })
      const tokenData = await tokenRes.json() as TokenResponse

      if (!tokenRes.ok || !tokenData.access_token) {
        const reason = tokenData.error_description ?? tokenData.error ?? `HTTP ${tokenRes.status}`
        return json({ error: `Falha na troca de codigo: ${reason}` }, 400)
      }

      // Sem refresh_token a conexao expira em uma hora e nao volta sozinha.
      // Falhar aqui, visivelmente, e melhor do que gravar uma conexao que
      // funciona hoje e morre amanha.
      if (!tokenData.refresh_token) {
        return json({
          error: 'O Google nao devolveu refresh_token. Remova o acesso da Veltzy em myaccount.google.com/permissions e conecte de novo.',
        }, 400)
      }

      const userinfoRes = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const userinfo = await userinfoRes.json() as { email?: string }
      if (!userinfo.email) return json({ error: 'Nao foi possivel ler o email da conta Google' }, 400)

      const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()

      const { error: upsertError } = await supabase
        .from('google_calendar_connections')
        .upsert({
          company_id: profile.company_id,
          profile_id: profile.id,
          google_email: userinfo.email,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          scope: tokenData.scope ?? null,
          is_active: true,
          last_error: null,
        }, { onConflict: 'profile_id' })

      if (upsertError) return json({ error: upsertError.message }, 500)

      return json({ success: true, googleEmail: userinfo.email })
    }

    if (action === 'disconnect') {
      const { data: connection } = await supabase
        .from('google_calendar_connections')
        .select('refresh_token')
        .eq('profile_id', profile.id)
        .maybeSingle()

      if (connection?.refresh_token) {
        // Revogar e cortesia com o usuario, nao pre-requisito: se o Google
        // recusar, a linha local sai do mesmo jeito.
        try {
          await fetch(`${REVOKE_URL}?token=${encodeURIComponent(connection.refresh_token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          })
        } catch {
          // ignora: o delete abaixo e o que importa
        }
      }

      const { error: deleteError } = await supabase
        .from('google_calendar_connections')
        .delete()
        .eq('profile_id', profile.id)
      if (deleteError) return json({ error: deleteError.message }, 500)

      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
