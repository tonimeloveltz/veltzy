import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Hub = mesmo projeto Supabase Central. URL pode ter override; a service key e a do
// runtime (casa com o guard m2m do Hub: token === SUPABASE_SERVICE_ROLE_KEY).
const HUB_URL = Deno.env.get('HUB_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
const HUB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const allowedOrigins = [
  'https://app.veltzy.com',
  'https://develop.app.veltzy.com',
  'http://localhost:5173',
  'http://localhost:5174', // dominio de dev do cadastro incorporado
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// Client do schema veltzy (cloud_api_numbers vive em veltzy.*).
function getVeltzyClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'veltzy' } },
  )
}

interface AuthResult {
  userId: string
  companyId: string
}

async function authenticateAndAuthorize(
  supabaseAdmin: ReturnType<typeof createClient>,
  authHeader: string | null,
): Promise<AuthResult | Response> {
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: 'Usuario sem empresa vinculada' }), { status: 400 })
  }

  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', profile.company_id)

  const userRoles = (roles ?? []).map((r: { role: string }) => r.role)

  if (!userRoles.some((r: string) => ['admin', 'super_admin'].includes(r))) {
    // Tentar super_admin global (role sem company_id)
    const { data: globalRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')

    if (!globalRoles || globalRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'Permissao negada' }), { status: 403 })
    }
  }

  return { userId: user.id, companyId: profile.company_id as string }
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao suportado' }), { status: 405, headers })
  }

  try {
    const supabaseAdmin = getAdminClient()

    const authResult = await authenticateAndAuthorize(supabaseAdmin, req.headers.get('Authorization'))
    if (authResult instanceof Response) {
      return new Response(authResult.body, { status: authResult.status, headers })
    }
    const { companyId } = authResult

    const { code, phone_number_id, waba_id, display_number } = await req.json()

    if (!code || !phone_number_id || !waba_id) {
      return new Response(
        JSON.stringify({ error: 'code, phone_number_id e waba_id obrigatorios' }),
        { status: 400, headers },
      )
    }

    const supabaseVeltzy = getVeltzyClient()

    // Conflito: numero ja cadastrado (phone_number_id UNIQUE, qualquer empresa).
    const { data: existing } = await supabaseVeltzy
      .from('cloud_api_numbers')
      .select('id')
      .eq('phone_number_id', phone_number_id)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({ error: 'Numero ja conectado' }), { status: 409, headers })
    }

    // Hub troca o code por token e persiste o token Hub-side. O Veltzy nunca recebe token.
    const hubRes = await fetch(`${HUB_URL}/functions/v1/cloud-api-onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': HUB_SERVICE_KEY,
        'Authorization': `Bearer ${HUB_SERVICE_KEY}`,
      },
      body: JSON.stringify({ code, phone_number_id, waba_id, company_id: companyId }),
    })

    if (!hubRes.ok) {
      const hubBody = await hubRes.text()
      return new Response(
        hubBody || JSON.stringify({ error: 'Falha ao registrar o numero' }),
        { status: hubRes.status, headers },
      )
    }

    // Primeiro numero ativo da empresa vira default (respeita unique parcial de is_default).
    const { count } = await supabaseVeltzy
      .from('cloud_api_numbers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active')

    const isDefault = (count ?? 0) === 0

    // access_token fica NULL: o token vive no Hub (public.cloud_api_credentials).
    const { error: insertError } = await supabaseVeltzy
      .from('cloud_api_numbers')
      .insert({
        company_id: companyId,
        phone_number_id,
        waba_id,
        display_number: display_number ?? null,
        instance_label: display_number ?? phone_number_id,
        access_token: null,
        status: 'active',
        is_default: isDefault,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ error: 'Numero ja conectado' }), { status: 409, headers })
      }
      console.error('cloud-api-onboard insert erro:', insertError.message)
      return new Response(JSON.stringify({ error: 'Erro ao salvar o numero' }), { status: 500, headers })
    }

    return new Response(JSON.stringify({ success: true, phone_number_id }), { status: 200, headers })
  } catch (err) {
    console.error('cloud-api-onboard erro:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
