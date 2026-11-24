import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

/**
 * Apaga TODAS as mensagens das conversas pedidas (os leads ficam no pipeline e em
 * Contatos). Único caminho de exclusão de veltzy.messages: o client não tem
 * policy de DELETE (migration do Hub).
 *
 * Regra por quantidade:
 * - 2+ leads (bulk): admin/super_admin + senha do próprio usuário, validada aqui.
 * - 1 lead (unitário, "x" da linha): manager/admin/super_admin, sem senha.
 *
 * Não apaga nada no WhatsApp nem os anexos do bucket chat-attachments.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const BATCH_SIZE = 50

const json = (payload: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(payload), { status, headers })

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, headers)

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return json({ error: 'unauthorized' }, 401, headers)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const veltzy = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'veltzy' } })

  try {
    const { data: userData, error: authErr } = await admin.auth.getUser(token)
    const user = userData?.user
    if (authErr || !user) return json({ error: 'unauthorized' }, 401, headers)

    const body = await req.json().catch(() => ({})) as {
      company_id?: string
      lead_ids?: unknown
      password?: string
    }
    const leadIds = Array.isArray(body.lead_ids)
      ? [...new Set(body.lead_ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : []
    if (leadIds.length === 0) return json({ error: 'lead_ids_obrigatorio' }, 400, headers)

    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      admin.from('user_roles').select('role').eq('user_id', user.id),
      admin.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle(),
    ])
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
    const isSuper = roles.includes('super_admin')
    const isAdmin = isSuper || roles.includes('admin')
    const isManager = isAdmin || roles.includes('manager')

    // Empresa: a do perfil. Super admin pode operar a empresa que está vendo
    // (impersonação), informada no body.
    const companyId = isSuper ? (body.company_id ?? profile?.company_id) : profile?.company_id
    if (!companyId) return json({ error: 'forbidden' }, 403, headers)
    if (!isSuper && body.company_id && body.company_id !== companyId) {
      return json({ error: 'forbidden' }, 403, headers)
    }

    const mode = leadIds.length > 1 ? 'bulk' : 'single'
    if (mode === 'bulk' ? !isAdmin : !isManager) return json({ error: 'forbidden' }, 403, headers)

    // Todos os leads precisam ser da empresa.
    let ownCount = 0
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const { count, error } = await veltzy
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('id', leadIds.slice(i, i + BATCH_SIZE))
      if (error) throw error
      ownCount += count ?? 0
    }
    if (ownCount !== leadIds.length) return json({ error: 'forbidden' }, 403, headers)

    if (mode === 'bulk') {
      if (!body.password || !user.email) return json({ error: 'senha_invalida' }, 401, headers)
      // Client anon descartável: não toca a sessão do browser.
      const verifier = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { error: pwErr } = await verifier.auth.signInWithPassword({
        email: user.email,
        password: body.password,
      })
      if (pwErr) return json({ error: 'senha_invalida' }, 401, headers)
      await verifier.auth.signOut({ scope: 'local' }).catch(() => {})
    }

    let deleted = 0
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const { count, error } = await veltzy
        .from('messages')
        .delete({ count: 'exact' })
        .eq('company_id', companyId)
        .in('lead_id', leadIds.slice(i, i + BATCH_SIZE))
      if (error) throw error
      deleted += count ?? 0
    }

    console.log(`[inbox-delete-messages] user=${user.id} company=${companyId} leads=${leadIds.length} deleted=${deleted} mode=${mode}`)
    return json({ deleted }, 200, headers)
  } catch (err) {
    console.error('[inbox-delete-messages] error:', err instanceof Error ? err.message : String(err))
    return json({ error: 'erro_interno' }, 500, headers)
  }
})
