import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HUB_URL = Deno.env.get('HUB_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
const HUB_SERVICE_KEY = Deno.env.get('HUB_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const allowedOrigins = [
  'https://app.veltzy.com',
  'https://develop.veltzy.com',
  'https://develop.app.veltzy.com',
  'http://localhost:5173',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  }
}

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

// Roteamento por provider. Default 'evolution' preserva o comportamento antigo
// (callers existentes nao passam provider). WAHA roteia pro waha-instance-manage
// do Hub e valida ownership em waha_instances por session_name.
const PROVIDER_CONFIG: Record<string, { hubFn: string; table: string; idField: string }> = {
  evolution: { hubFn: 'evolution-instance-manage', table: 'evolution_instances', idField: 'instance_name' },
  waha: { hubFn: 'waha-instance-manage', table: 'waha_instances', idField: 'session_name' },
}

function getProviderConfig(provider?: string) {
  return PROVIDER_CONFIG[provider ?? 'evolution'] ?? PROVIDER_CONFIG.evolution
}

interface AuthResult {
  userId: string
  companyId: string
}

async function authenticateAndAuthorize(
  supabaseAdmin: ReturnType<typeof createClient>,
  authHeader: string | null
): Promise<AuthResult | Response> {
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Nao autorizado' }),
      { status: 401 }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return new Response(
      JSON.stringify({ error: 'Nao autorizado' }),
      { status: 401 }
    )
  }

  // Buscar profile → company_id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.company_id) {
    return new Response(
      JSON.stringify({ error: 'Usuario sem empresa vinculada' }),
      { status: 400 }
    )
  }

  // Validar role: admin ou super_admin
  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', profile.company_id)

  const userRoles = (roles ?? []).map((r: { role: string }) => r.role)

  // super_admin pode ter role global (sem company_id filter)
  if (!userRoles.some((r: string) => ['admin', 'super_admin'].includes(r))) {
    // Tentar super_admin global
    const { data: globalRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')

    if (!globalRoles || globalRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Permissao negada' }),
        { status: 403 }
      )
    }
  }

  return { userId: user.id, companyId: profile.company_id }
}

async function validateInstanceOwnership(
  supabaseAdmin: ReturnType<typeof createClient>,
  table: string,
  idField: string,
  idValue: string,
  companyId: string
): Promise<{ status: string } | Response> {
  const { data: instance } = await supabaseAdmin
    .from(table)
    .select('company_id, status')
    .eq(idField, idValue)
    .single()

  if (!instance) {
    return new Response(
      JSON.stringify({ error: 'Instancia nao encontrada' }),
      { status: 404 }
    )
  }

  if (instance.company_id !== companyId) {
    return new Response(
      JSON.stringify({ error: 'Instancia nao pertence a empresa' }),
      { status: 403 }
    )
  }

  return { status: instance.status }
}

async function callHub(
  hubFn: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const url = `${HUB_URL}/functions/v1/${hubFn}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUB_SERVICE_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const supabaseAdmin = getAdminClient()

    // Auth + role validation
    const authResult = await authenticateAndAuthorize(
      supabaseAdmin,
      req.headers.get('Authorization')
    )

    if (authResult instanceof Response) {
      return new Response(authResult.body, {
        status: authResult.status,
        headers,
      })
    }

    const { companyId } = authResult

    // -----------------------------------------------------------------------
    // POST: criar instancia
    // -----------------------------------------------------------------------
    if (req.method === 'POST') {
      const { display_name, provider } = await req.json()
      const cfg = getProviderConfig(provider)

      const hubRes = await callHub(cfg.hubFn, 'POST', '', {
        company_id: companyId,
        display_name: display_name || undefined,
      })

      const hubBody = await hubRes.text()
      return new Response(hubBody, { status: hubRes.status, headers })
    }

    // -----------------------------------------------------------------------
    // GET: buscar QR code (apenas para regenerar apos expiracao)
    // -----------------------------------------------------------------------
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const cfg = getProviderConfig(url.searchParams.get('provider') ?? undefined)
      const idValue = url.searchParams.get(cfg.idField)

      if (!idValue) {
        return new Response(
          JSON.stringify({ error: `${cfg.idField} obrigatorio` }),
          { status: 400, headers }
        )
      }

      const ownership = await validateInstanceOwnership(supabaseAdmin, cfg.table, cfg.idField, idValue, companyId)
      if (ownership instanceof Response) {
        return new Response(ownership.body, { status: ownership.status, headers })
      }

      const hubRes = await callHub(cfg.hubFn, 'GET', `?${cfg.idField}=${idValue}`)
      const hubBody = await hubRes.text()
      return new Response(hubBody, { status: hubRes.status, headers })
    }

    // -----------------------------------------------------------------------
    // PATCH: desconectar / reconectar
    // -----------------------------------------------------------------------
    if (req.method === 'PATCH') {
      const body = await req.json()
      const cfg = getProviderConfig(body.provider)
      const idValue = body[cfg.idField]
      const { action } = body

      if (!idValue || !['disconnect', 'reconnect'].includes(action)) {
        return new Response(
          JSON.stringify({ error: `${cfg.idField} e action (disconnect|reconnect) obrigatorios` }),
          { status: 400, headers }
        )
      }

      const ownership = await validateInstanceOwnership(supabaseAdmin, cfg.table, cfg.idField, idValue, companyId)
      if (ownership instanceof Response) {
        return new Response(ownership.body, { status: ownership.status, headers })
      }

      const hubRes = await callHub(cfg.hubFn, 'PATCH', '', {
        [cfg.idField]: idValue,
        action,
        company_id: companyId,
      })

      const hubBody = await hubRes.text()
      return new Response(hubBody, { status: hubRes.status, headers })
    }

    // -----------------------------------------------------------------------
    // DELETE: deletar instancia
    // -----------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const body = await req.json()
      const cfg = getProviderConfig(body.provider)
      const idValue = body[cfg.idField]

      if (!idValue) {
        return new Response(
          JSON.stringify({ error: `${cfg.idField} obrigatorio` }),
          { status: 400, headers }
        )
      }

      const ownership = await validateInstanceOwnership(supabaseAdmin, cfg.table, cfg.idField, idValue, companyId)
      if (ownership instanceof Response) {
        return new Response(ownership.body, { status: ownership.status, headers })
      }

      // Apenas instancias desconectadas podem ser deletadas
      if (ownership.status === 'connected') {
        return new Response(
          JSON.stringify({ error: 'Instancia deve estar desconectada para deletar' }),
          { status: 400, headers }
        )
      }

      const hubRes = await callHub(cfg.hubFn, 'DELETE', '', {
        [cfg.idField]: idValue,
        company_id: companyId,
      })

      const hubBody = await hubRes.text()
      return new Response(hubBody, { status: hubRes.status, headers })
    }

    return new Response(
      JSON.stringify({ error: 'Metodo nao suportado' }),
      { status: 405, headers }
    )
  } catch (err) {
    console.error('whatsapp-instance-manage erro:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
