import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { leadMatchesConditions, type CadenceCondition } from '../_shared/cadence-conditions.ts'

// start-cadences (mkt-ativo Corte B): START POR EVENTO. Chamada AO LADO do
// run-automations (lead-inbound-handler etc.) — NÃO toca o run-automations core.
// Dado {trigger, leadId, companyId}: gate mkt_ativo_enabled → cadências habilitadas
// com trigger_event=trigger → avalia trigger_conditions → cria cadence_run idempotente
// (UNIQUE cadence_id,lead_id). O process-cadences (cron) avança os runs.
// verify_jwt=false (service-to-service, mesmo padrão do run-automations).

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { trigger, leadId, companyId } = await req.json()
    if (!trigger || !leadId || !companyId) {
      return json({ error: 'trigger, leadId e companyId obrigatorios' }, corsHeaders, 400)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })
    const publicDb = createClient(url, key)

    // GATE por-empresa (mesma flag da pegada mkt-ativo; à prova de bypass no server).
    const { data: company } = await publicDb
      .from('companies').select('features').eq('id', companyId).single()
    if (((company?.features ?? {}) as Record<string, unknown>).mkt_ativo_enabled !== true) {
      return json({ skipped: true, reason: 'mkt_ativo_not_enabled' }, corsHeaders)
    }

    const { data: cadences } = await veltzy
      .from('cadences')
      .select('id, trigger_conditions')
      .eq('company_id', companyId)
      .eq('is_enabled', true)
      .eq('trigger_event', trigger)
    if (!cadences || cadences.length === 0) return json({ started: 0 }, corsHeaders)

    const { data: lead } = await veltzy.from('leads').select('*').eq('id', leadId).single()
    if (!lead) return json({ error: 'Lead nao encontrado' }, corsHeaders, 404)

    // Enriquece o lead com stage_id do deal ABERTO mais recente (o stage vive em deals,
    // não em leads) para conditions com field='stage_id'. Espelha o run-automations.
    const { data: openDeal } = await veltzy
      .from('deals')
      .select('stage_id')
      .eq('lead_id', leadId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const leadForConditions = { ...(lead as Record<string, unknown>), stage_id: openDeal?.stage_id ?? null }

    const nowIso = new Date().toISOString()
    let started = 0
    for (const cadence of cadences) {
      if (!leadMatchesConditions(cadence.trigger_conditions as CadenceCondition[], leadForConditions)) continue
      // Idempotente: UNIQUE(cadence_id, lead_id) — não reinscreve lead já na cadência.
      const { error, count } = await veltzy
        .from('cadence_runs')
        .upsert({
          cadence_id: cadence.id,
          lead_id: leadId,
          company_id: companyId,
          current_step: 0,
          status: 'active',
          next_run_at: nowIso,
        }, { onConflict: 'cadence_id,lead_id', ignoreDuplicates: true, count: 'exact' })
      if (!error && count) started += count
    }

    return json({ started }, corsHeaders)
  } catch (err) {
    return json({ error: (err as Error).message }, getCorsHeaders(req), 500)
  }
})

function json(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
