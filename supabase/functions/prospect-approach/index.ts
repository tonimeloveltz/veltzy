import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { prospectCreateLeadDeal } from '../_shared/prospect-create-lead-deal.ts'

// Thin edge do V5: botao "Abordei" da aba Alerta. O admin abordou o prospect por fora
// (o sinal nao tinha telefone DM-able). Cria contato+deal pela funcao estreita, reserva
// prospect_contacted (mesma chave sha256(phone)) e marca o sinal — SEM enviar DM.
// verify_jwt=true + admin/super_admin da empresa do sinal.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
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
    const body = await req.json() as { signal_id?: string; phone?: string }
    if (!body.signal_id) return json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'signal_id obrigatorio' } }, 400, headers)

    const { data: signal } = await supabase
      .from('prospect_signals').select('company_id, group_id, author_phone_resolved').eq('id', body.signal_id).maybeSingle()
    if (!signal) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'sinal nao encontrado' } }, 404, headers)
    const companyId: string = signal.company_id

    // Auth: admin/super_admin da empresa do sinal.
    const { data: userData, error: authErr } = await supabasePublic.auth.getUser(token)
    if (authErr || !userData?.user) return json({ ok: false, error: 'Invalid token' }, 401, headers)
    const userId = userData.user.id
    const { data: roleRows } = await supabasePublic.from('user_roles').select('role').eq('user_id', userId)
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
    const isSuper = roles.includes('super_admin')
    if (!isSuper) {
      if (!roles.includes('admin')) return json({ ok: false, error: 'Forbidden' }, 403, headers)
      const { data: profile } = await supabasePublic.from('profiles').select('company_id').eq('user_id', userId).maybeSingle()
      if (profile?.company_id !== companyId) return json({ ok: false, error: 'Forbidden' }, 403, headers)
    }

    // Telefone: do sinal (quando resolvido) OU informado pelo admin (alertas @lid nao tem).
    const rawPhone = signal.author_phone_resolved ?? (body.phone ? normalizePhoneBR(body.phone) : null)
    if (!rawPhone || rawPhone.length < 12 || rawPhone.length > 13) {
      return json({ ok: false, error: { code: 'NO_PHONE', message: 'sinal sem telefone; informe phone no corpo' } }, 400, headers)
    }

    // Resolve pipeline/source da prospeccao.
    const [{ data: pipeline }, { data: source }] = await Promise.all([
      supabase.from('pipelines').select('id').eq('company_id', companyId).eq('name', 'Prospecção grupos').maybeSingle(),
      supabase.from('lead_sources').select('id').eq('company_id', companyId).eq('slug', 'grupo-whatsapp').maybeSingle(),
    ])
    if (!pipeline?.id) return json({ ok: false, error: { code: 'NO_PIPELINE', message: 'pipeline Prospeccao grupos ausente' } }, 500, headers)

    const { data: group } = await supabase.from('prospect_groups').select('name, session_name').eq('id', signal.group_id).maybeSingle()

    const { leadId, dealId } = await prospectCreateLeadDeal({
      supabaseUrl: SUPABASE_URL, supabaseKey: SERVICE_ROLE,
      companyId, phone: rawPhone, name: null,
      sessionName: group?.session_name ?? 'manual', groupName: group?.name ?? null,
      pipelineId: pipeline.id, sourceId: source?.id ?? null,
    })

    // Reserva no ledger (mesma chave do dm-send) — nao recontatar por DM depois.
    await supabase.from('prospect_contacted').upsert(
      { company_id: companyId, person_key: await sha256Hex(rawPhone), responded: false },
      { onConflict: 'company_id,person_key', ignoreDuplicates: true },
    )

    await supabase.from('prospect_signals').update({ status: 'approved', lead_id: leadId, deal_id: dealId }).eq('id', body.signal_id)

    return json({ ok: true, lead_id: leadId, deal_id: dealId }, 200, headers)
  } catch (err) {
    console.error('[prospect-approach]', err)
    return json({ ok: false, error: (err as Error).message }, 500, headers)
  }
})
