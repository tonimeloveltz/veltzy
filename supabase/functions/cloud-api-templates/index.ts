import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Hub = mesmo projeto Supabase Central. O token da WABA vive so no Hub; o Veltzy
// passa waba_id + company_id e o Hub chama a Graph (mesmo padrao do onboarding/envio).
const HUB_URL = Deno.env.get('HUB_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
const HUB_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// Client do schema veltzy (cloud_api_numbers e whatsapp_templates vivem em veltzy.*).
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

// A tabela veltzy.whatsapp_templates tem CHECK em status/category/quality_rating.
// O Hub repassa o RAW da Graph; a normalizacao (para nao explodir o CHECK) e aqui.
const STATUS_MAP: Record<string, string> = {
  PENDING: 'IN_REVIEW',
  PENDING_REVIEW: 'IN_REVIEW',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
}

function normStatus(raw: unknown): string {
  const key = typeof raw === 'string' ? raw.toUpperCase() : ''
  const mapped = STATUS_MAP[key]
  if (!mapped) {
    console.warn(`cloud-api-templates: status inesperado da Meta "${raw}" -> IN_REVIEW`)
    return 'IN_REVIEW'
  }
  return mapped
}

function normQuality(raw: unknown): string | null {
  const key = typeof raw === 'string' ? raw.toUpperCase() : ''
  return ['GREEN', 'YELLOW', 'RED'].includes(key) ? key : null
}

const VALID_CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION']

interface RawTemplate {
  id?: string
  name?: string
  language?: string
  status?: string
  category?: string
  components?: unknown
  quality_score?: { score?: string }
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

    const { action } = await req.json()

    if (action !== 'list') {
      return new Response(JSON.stringify({ error: 'Acao nao suportada' }), { status: 400, headers })
    }

    const supabaseVeltzy = getVeltzyClient()

    // A Template API e por WABA. Resolve o numero oficial da empresa (default primeiro).
    const { data: number } = await supabaseVeltzy
      .from('cloud_api_numbers')
      .select('id, waba_id')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!number?.waba_id) {
      return new Response(
        JSON.stringify({ error: 'Nenhum numero oficial conectado' }),
        { status: 404, headers },
      )
    }

    const wabaId = number.waba_id as string
    const cloudApiNumberId = number.id as string

    // O Hub resolve o token da WABA e chama a Graph (GET /{waba_id}/message_templates).
    const hubRes = await fetch(`${HUB_URL}/functions/v1/cloud-api-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': HUB_SERVICE_KEY,
        'Authorization': `Bearer ${HUB_SERVICE_KEY}`,
      },
      body: JSON.stringify({ action: 'list', waba_id: wabaId }),
    })

    if (!hubRes.ok) {
      const hubBody = await hubRes.text()
      return new Response(
        hubBody || JSON.stringify({ error: 'Falha ao listar os templates' }),
        { status: hubRes.status, headers },
      )
    }

    const { data: rawTemplates } = (await hubRes.json()) as { data?: RawTemplate[] }
    const templates = rawTemplates ?? []

    // Normaliza (CHECK-safe) e monta as linhas do upsert.
    const rows = templates
      .map((t) => {
        const category = typeof t.category === 'string' ? t.category.toUpperCase() : ''
        if (!VALID_CATEGORIES.includes(category)) {
          console.warn(`cloud-api-templates: categoria inesperada "${t.category}" no template "${t.name}" -> pulando`)
          return null
        }
        if (!t.name || !t.language) return null
        return {
          company_id: companyId,
          cloud_api_number_id: cloudApiNumberId,
          waba_id: wabaId,
          meta_template_id: t.id ?? null,
          name: t.name,
          language: t.language,
          category,
          status: normStatus(t.status),
          quality_rating: normQuality(t.quality_score?.score),
          components: t.components ?? [],
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length > 0) {
      // NAO enviamos created_by/created_at: o update do upsert preserva os originais.
      const { error: upsertError } = await supabaseVeltzy
        .from('whatsapp_templates')
        .upsert(rows, { onConflict: 'company_id,waba_id,name,language' })

      if (upsertError) {
        console.error('cloud-api-templates upsert erro:', upsertError.message)
        return new Response(JSON.stringify({ error: 'Erro ao salvar os templates' }), { status: 500, headers })
      }
    }

    return new Response(JSON.stringify({ success: true, count: rows.length }), { status: 200, headers })
  } catch (err) {
    console.error('cloud-api-templates erro:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
