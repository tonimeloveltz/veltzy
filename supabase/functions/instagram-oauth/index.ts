import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'
import { guardarSegredo, instagramTokenSecretName } from '../_shared/vault-secret.ts'
import { graphRequest, INSTAGRAM_GRAPH_HOST } from '../_shared/instagram-graph.ts'
import { OAUTH_STATE_TTL_MS, signState, verifyState } from '../_shared/instagram-oauth-state.ts'

// Instagram DM, Onda 1 (Spec 5.1): conexao pela Instagram API com Instagram Login.
// company_id vem sempre do perfil, nunca do body. Nunca logar token, code ou state.

const SCOPES = 'instagram_business_basic,instagram_business_manage_messages'
const WEBHOOK_FIELDS = 'messages,message_echoes,messaging_seen,messaging_postbacks,messaging_referral,message_reactions'
const DEFAULT_EXPIRES_IN_S = 60 * 24 * 60 * 60

interface ShortTokenData {
  access_token?: string
  user_id?: string | number
}

interface ShortTokenResponse extends ShortTokenData {
  data?: ShortTokenData[]
}

interface LongTokenResponse {
  access_token?: string
  expires_in?: number
}

interface MeResponse {
  user_id?: string
  id?: string
  username?: string
  name?: string
  account_type?: string
}

/** Admin da propria empresa ou super_admin global (mesmo criterio do whatsapp-instance-manage). */
const isCompanyAdmin = async (client: SupabaseClient, userId: string, companyId: string): Promise<boolean> => {
  const { data: roles } = await client.from('user_roles').select('role, company_id').eq('user_id', userId)
  return (roles ?? []).some((r: { role: string; company_id: string | null }) =>
    r.role === 'super_admin' || (r.role === 'admin' && r.company_id === companyId),
  )
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    // A7: client no schema public (service_role) para auth, perfis e wrappers do Vault.
    const supabasePublic = createClient(url, key)

    const { data: { user }, error: authError } = await supabasePublic.auth.getUser(authHeader.slice('Bearer '.length))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = typeof body?.action === 'string' ? body.action : ''

    const { data: profile } = await supabasePublic.from('profiles').select('company_id').eq('user_id', user.id).single()
    if (!profile?.company_id) return json({ error: 'No company' }, 403)
    const companyId: string = profile.company_id

    if (action === 'status') {
      const { data: connection } = await supabase
        .from('instagram_connections')
        .select('instagram_username, instagram_name, status, is_active, auth_flow, token_expires_at, webhook_subscribed_at, last_error')
        .eq('company_id', companyId)
        .maybeSingle()
      return json({ connection: connection ?? null })
    }

    if (action !== 'authorize' && action !== 'callback' && action !== 'disconnect') {
      return json({ error: 'Unknown action' }, 400)
    }

    if (!(await isCompanyAdmin(supabasePublic, user.id, companyId))) return json({ error: 'Forbidden' }, 403)

    const appId = Deno.env.get('INSTAGRAM_APP_ID')
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET')
    const redirectUri = Deno.env.get('INSTAGRAM_REDIRECT_URI')
    const stateSecret = Deno.env.get('INSTAGRAM_OAUTH_STATE_SECRET')
    const missingConfig = () => {
      console.error('[instagram-oauth] configuracao ausente', {
        appId: !!appId, appSecret: !!appSecret, redirectUri: !!redirectUri, stateSecret: !!stateSecret,
      })
      return json({ error: 'instagram_nao_configurado' }, 500)
    }

    if (action === 'authorize') {
      const { data: flag } = await supabasePublic
        .from('tenant_feature_flags')
        .select('enabled')
        .eq('company_id', companyId)
        .eq('feature_key', 'instagram_enabled')
        .maybeSingle()
      if (!flag?.enabled) return json({ error: 'instagram_nao_habilitado' }, 409)
      if (!appId || !redirectUri || !stateSecret) return missingConfig()

      const state = await signState(
        { companyId, userId: user.id, nonce: crypto.randomUUID(), exp: Date.now() + OAUTH_STATE_TTL_MS },
        stateSecret,
      )
      // redirect_uri vem so do env, nunca do body.
      const authorizeUrl = new URL('https://www.instagram.com/oauth/authorize')
      authorizeUrl.searchParams.set('client_id', appId)
      authorizeUrl.searchParams.set('redirect_uri', redirectUri)
      authorizeUrl.searchParams.set('response_type', 'code')
      authorizeUrl.searchParams.set('scope', SCOPES)
      authorizeUrl.searchParams.set('state', state)
      return json({ url: authorizeUrl.toString() })
    }

    if (action === 'disconnect') {
      // Token apagado primeiro: se o update falhar, o envio ja nao tem com o que mandar.
      await guardarSegredo(supabasePublic, instagramTokenSecretName(companyId), '')
      await supabase
        .from('instagram_connections')
        .update({ is_active: false, status: 'revoked', last_error: null })
        .eq('company_id', companyId)
      return json({ success: true })
    }

    // --- callback ---
    const rawState = typeof body?.state === 'string' ? body.state : ''
    const statePayload = stateSecret ? await verifyState(rawState, stateSecret, new Date()) : null
    if (!statePayload || statePayload.userId !== user.id || statePayload.companyId !== companyId) {
      return json({ error: 'state_invalido' }, 403)
    }
    if (!appId || !appSecret || !redirectUri) return missingConfig()

    const oauthFailed = (step: string, detail: string) => {
      console.warn('[instagram-oauth] troca falhou', { step, detail })
      return json({ error: 'oauth_falhou', detail }, 400)
    }

    const code = typeof body?.code === 'string' ? body.code.replace(/#_$/, '') : ''
    if (!code) return oauthFailed('code', 'Codigo de autorizacao ausente')

    // 3. code -> token curto (+ user_id do app)
    const short = await graphRequest<ShortTokenResponse>('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    if (!short.ok) return oauthFailed('short_token', short.error.message)
    const shortData = short.data.data?.[0] ?? short.data
    if (!shortData.access_token) return oauthFailed('short_token', 'Resposta da Meta sem token')
    const appUserId = shortData.user_id != null ? String(shortData.user_id) : null

    // 4. token curto -> token de longa duracao (60 dias)
    const long = await graphRequest<LongTokenResponse>(`${INSTAGRAM_GRAPH_HOST}/access_token`, {
      query: { grant_type: 'ig_exchange_token', client_secret: appSecret, access_token: shortData.access_token },
    })
    if (!long.ok) return oauthFailed('long_token', long.error.message)
    if (!long.data.access_token) return oauthFailed('long_token', 'Resposta da Meta sem token')
    const longToken = long.data.access_token
    const expiresIn = typeof long.data.expires_in === 'number' ? long.data.expires_in : DEFAULT_EXPIRES_IN_S

    // 5. conta profissional (user_id e o entry.id dos webhooks)
    const me = await graphRequest<MeResponse>('/me', {
      token: longToken,
      query: { fields: 'user_id,username,name,account_type' },
    })
    if (!me.ok) return oauthFailed('me', me.error.message)
    const accountId = me.data.user_id ?? me.data.id
    if (!accountId) return oauthFailed('me', 'Resposta da Meta sem id da conta')

    // 6. D3: a mesma conta nao pode estar ativa em outra empresa.
    const { data: otherCompany } = await supabase
      .from('instagram_connections')
      .select('id')
      .eq('instagram_account_id', accountId)
      .eq('is_active', true)
      .neq('company_id', companyId)
      .limit(1)
      .maybeSingle()
    if (otherCompany) return json({ error: 'conta_em_outra_empresa' }, 409)

    // 7. Segredo ANTES do upsert (mesma ordem do A7): sem Vault, sem conexao.
    await guardarSegredo(supabasePublic, instagramTokenSecretName(companyId), longToken)

    // 8. Uma conexao por empresa (D2).
    const now = Date.now()
    const { error: upsertError } = await supabase
      .from('instagram_connections')
      .upsert({
        company_id: companyId,
        instagram_account_id: accountId,
        instagram_app_user_id: appUserId,
        instagram_username: me.data.username ?? null,
        instagram_name: me.data.name ?? null,
        page_id: null,
        page_name: null,
        auth_flow: 'instagram_login',
        status: 'active',
        is_active: true,
        token_expires_at: new Date(now + expiresIn * 1000).toISOString(),
        token_refreshed_at: new Date(now).toISOString(),
        webhook_subscribed_at: null,
        last_error: null,
        created_by: user.id,
      }, { onConflict: 'company_id' })
    if (upsertError) {
      // 23505 no indice unico parcial: outra empresa ativou a mesma conta entre o passo 6 e o upsert.
      if (upsertError.code === '23505') return json({ error: 'conta_em_outra_empresa' }, 409)
      throw new Error(`Falha ao salvar conexao: ${upsertError.message}`)
    }

    // 9. Inscricao do webhook. Falha nao desfaz a conexao: o card pede reconexao.
    const subscribe = await graphRequest<{ success?: boolean }>('/me/subscribed_apps', {
      method: 'POST',
      token: longToken,
      query: { subscribed_fields: WEBHOOK_FIELDS },
    })
    if (subscribe.ok && subscribe.data.success !== false) {
      await supabase
        .from('instagram_connections')
        .update({ webhook_subscribed_at: new Date().toISOString() })
        .eq('company_id', companyId)
      return json({ success: true })
    }

    const detail = subscribe.ok ? 'Resposta da Meta sem sucesso' : subscribe.error.message
    console.warn('[instagram-oauth] inscricao do webhook falhou', { detail })
    await supabase
      .from('instagram_connections')
      .update({ status: 'error', last_error: `Falha ao inscrever webhook: ${detail}` })
      .eq('company_id', companyId)
    return json({ success: true, warning: 'webhook_nao_inscrito' })
  } catch (err) {
    console.error('[instagram-oauth] error:', err instanceof Error ? err.message : String(err))
    return json({ error: 'Erro inesperado' }, 500)
  }
})
