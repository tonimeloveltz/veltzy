import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPublicCorsHeaders } from '../_shared/cors.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'

// cadence-webhook (Automações · gatilho 'webhook'). Público, auth pelo webhook_token
// da automação (body.webhook_token ou ?token=). Payload { phone (obrig.), name? }.
// Resolve lead EXISTENTE por telefone (normaliza BR) → cria cadence_run idempotente.
// Lead inexistente = 200 ignorado (NÃO cria lead; ingestão é a source-webhook). verify_jwt=false.

Deno.serve(async (req) => {
  const corsHeaders = getPublicCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, corsHeaders, 405)

  try {
    const u = new URL(req.url)
    const body = await req.json().catch(() => ({})) as { webhook_token?: string; phone?: string; name?: string }
    const token = body.webhook_token ?? u.searchParams.get('token') ?? ''
    if (!token) return json({ error: 'webhook_token obrigatorio' }, corsHeaders, 400)
    if (!body.phone) return json({ error: 'phone obrigatorio' }, corsHeaders, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })
    const publicDb = createClient(url, key)

    // Resolve a automação pelo token (único). Token inválido = 200 ignorado (não vaza).
    const { data: cadence } = await veltzy
      .from('cadences')
      .select('id, company_id, is_enabled')
      .eq('webhook_token', token)
      .eq('trigger_event', 'webhook')
      .maybeSingle()
    if (!cadence || !cadence.is_enabled) return json({ ok: true, ignored: 'token' }, corsHeaders)

    // Gate por empresa.
    const { data: company } = await publicDb.from('companies').select('features').eq('id', cadence.company_id).single()
    if (((company?.features ?? {}) as Record<string, unknown>).mkt_ativo_enabled !== true) {
      return json({ ok: true, ignored: 'disabled' }, corsHeaders)
    }

    // Lead EXISTENTE por telefone normalizado (não cria lead).
    const phone = normalizePhoneBR(body.phone)
    const { data: lead } = await veltzy
      .from('leads')
      .select('id')
      .eq('company_id', cadence.company_id)
      .eq('phone', phone)
      .maybeSingle()
    if (!lead) return json({ ok: true, ignored: 'lead_not_found' }, corsHeaders)

    const { data: openDeal } = await veltzy
      .from('deals').select('stage_id').eq('lead_id', lead.id).eq('status', 'open')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    const { count } = await veltzy
      .from('cadence_runs')
      .upsert({
        cadence_id: cadence.id,
        lead_id: lead.id,
        company_id: cadence.company_id,
        current_step: 0,
        status: 'active',
        next_run_at: new Date().toISOString(),
        initial_stage_id: (openDeal?.stage_id as string | null) ?? null,
      }, { onConflict: 'cadence_id,lead_id', ignoreDuplicates: true, count: 'exact' })

    return json({ ok: true, started: count ?? 0 }, corsHeaders)
  } catch (err) {
    return json({ error: (err as Error).message }, getPublicCorsHeaders(req), 500)
  }
})

function json(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
