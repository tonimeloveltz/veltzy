import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { composeProspectDm } from '../_shared/prospect-compose-dm.ts'

// Thin edge do V5: a UI pede um RASCUNHO de DM pro admin editar. O browser nao chama
// ai-complete/_shared direto. verify_jwt=true + papel admin/super_admin da empresa do
// sinal. NAO envia nada — so devolve o texto (ja com opt-out garantido pelo compositor).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405, headers)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401, headers)
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const body = await req.json() as { signal_id?: string }
    if (!body.signal_id) return json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'signal_id obrigatorio' } }, 400, headers)

    const { data: signal } = await supabase
      .from('prospect_signals').select('company_id, group_id, snippet, category').eq('id', body.signal_id).maybeSingle()
    if (!signal) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'sinal nao encontrado' } }, 404, headers)

    // Auth: JWT de usuario admin/super_admin da empresa do sinal (super_admin cross-company).
    const { data: userData, error: authErr } = await supabasePublic.auth.getUser(token)
    if (authErr || !userData?.user) return json({ ok: false, error: 'Invalid token' }, 401, headers)
    const userId = userData.user.id
    const { data: roleRows } = await supabasePublic.from('user_roles').select('role').eq('user_id', userId)
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
    const isSuper = roles.includes('super_admin')
    if (!isSuper) {
      if (!roles.includes('admin')) return json({ ok: false, error: 'Forbidden' }, 403, headers)
      const { data: profile } = await supabasePublic.from('profiles').select('company_id').eq('user_id', userId).maybeSingle()
      if (profile?.company_id !== signal.company_id) return json({ ok: false, error: 'Forbidden' }, 403, headers)
    }

    const { data: group } = await supabase.from('prospect_groups').select('name').eq('id', signal.group_id).maybeSingle()
    const draft = await composeProspectDm({
      companyId: signal.company_id,
      snippet: signal.snippet,
      category: signal.category,
      groupName: group?.name ?? null,
    })

    return json({ ok: true, draft }, 200, headers)
  } catch (err) {
    console.error('[prospect-dm-draft]', err)
    return json({ ok: false, error: (err as Error).message }, 500, headers)
  }
})
