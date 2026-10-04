import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'
import { getCorsHeaders } from '../_shared/cors.ts'
import { leadMatchesConditions, type CadenceCondition } from '../_shared/cadence-conditions.ts'

// process-recurring-cadences (Automações · gatilho 'recurring'). Cron a cada 15min:
// acha automações recurring "due" (recurring_cron preset + recurring_last_run_at),
// cria cadence_runs idempotente p/ os leads ativos que casam as condições (SOMENTE SE),
// grava recurring_last_run_at. verify_jwt=false (service-to-service, cron-auth).

const BRT_OFFSET_MIN = -180

// recurring_cron presets: 'daily@HH:MM' | 'weekly@<dow0-6>@HH:MM' | 'monthly@<dom1-31>@HH:MM'.
// "due" = agora (BRT) já passou do horário do período atual E a automação não rodou neste período.
export function isRecurringDue(cron: string | null, lastRunIso: string | null, now: Date): boolean {
  if (!cron) return false
  const parts = cron.split('@')
  const kind = parts[0]
  const local = new Date(now.getTime() + BRT_OFFSET_MIN * 60_000)
  const dow = local.getUTCDay()           // 0-6 no horário local (usamos getUTC* sobre o ms já deslocado)
  const dom = local.getUTCDate()
  const minutesNow = local.getUTCHours() * 60 + local.getUTCMinutes()

  const hhmm = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  // Chave do período atual (BRT) para saber se já rodou.
  const dayKey = `${local.getUTCFullYear()}-${local.getUTCMonth()}-${dom}`
  const weekKey = `${local.getUTCFullYear()}-w${Math.floor((local.getTime()) / (7 * 86_400_000))}`
  const monthKey = `${local.getUTCFullYear()}-${local.getUTCMonth()}`

  let scheduledMin: number
  let periodKey: string
  if (kind === 'daily') { scheduledMin = hhmm(parts[1] ?? '09:00'); periodKey = dayKey }
  else if (kind === 'weekly') { if (Number(parts[1]) !== dow) return false; scheduledMin = hhmm(parts[2] ?? '09:00'); periodKey = weekKey }
  else if (kind === 'monthly') { if (Number(parts[1]) !== dom) return false; scheduledMin = hhmm(parts[2] ?? '09:00'); periodKey = monthKey }
  else return false

  if (minutesNow < scheduledMin) return false
  if (!lastRunIso) return true
  // Já rodou neste período? Compara a chave do período do last_run com a de agora.
  const lr = new Date(new Date(lastRunIso).getTime() + BRT_OFFSET_MIN * 60_000)
  const lrDayKey = `${lr.getUTCFullYear()}-${lr.getUTCMonth()}-${lr.getUTCDate()}`
  const lrWeekKey = `${lr.getUTCFullYear()}-w${Math.floor((lr.getTime()) / (7 * 86_400_000))}`
  const lrMonthKey = `${lr.getUTCFullYear()}-${lr.getUTCMonth()}`
  const lrKey = kind === 'daily' ? lrDayKey : kind === 'weekly' ? lrWeekKey : lrMonthKey
  return lrKey !== periodKey
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!isCronAuthorized(req)) return cronUnauthorized(corsHeaders)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })
    const publicDb = createClient(url, key)
    const now = new Date()
    const nowIso = now.toISOString()

    const { data: cadences } = await veltzy
      .from('cadences')
      .select('id, company_id, trigger_conditions, recurring_cron, recurring_last_run_at')
      .eq('is_enabled', true)
      .eq('trigger_event', 'recurring')
    if (!cadences || cadences.length === 0) return json({ processed: 0, started: 0 }, corsHeaders)

    // Cache do gate por empresa (mkt_ativo_enabled) p/ não consultar companies repetido.
    const gate = new Map<string, boolean>()
    const isEnabled = async (companyId: string) => {
      if (gate.has(companyId)) return gate.get(companyId)!
      const { data: c } = await publicDb.from('companies').select('features').eq('id', companyId).single()
      const on = ((c?.features ?? {}) as Record<string, unknown>).mkt_ativo_enabled === true
      gate.set(companyId, on)
      return on
    }

    let started = 0
    let processed = 0
    for (const cad of cadences) {
      if (!isRecurringDue(cad.recurring_cron as string | null, cad.recurring_last_run_at as string | null, now)) continue
      if (!(await isEnabled(cad.company_id as string))) continue
      processed++

      // Audiência: leads ativos (não opt-out, com telefone) que casam as condições do SOMENTE SE.
      const { data: leads } = await veltzy
        .from('leads')
        .select('*')
        .eq('company_id', cad.company_id)
        .eq('marketing_opt_out', false)
        .not('phone', 'is', null)
      const conds = (cad.trigger_conditions ?? []) as CadenceCondition[]

      // Enriquece com stage do deal aberto recente só se houver condição de stage.
      let stageByLead = new Map<string, string | null>()
      if (conds.some((c) => c.field === 'stage_id')) {
        const { data: openDeals } = await veltzy
          .from('deals').select('lead_id, stage_id, created_at').eq('company_id', cad.company_id).eq('status', 'open')
          .order('created_at', { ascending: false })
        stageByLead = new Map()
        for (const d of (openDeals ?? []) as { lead_id: string; stage_id: string | null }[]) {
          if (!stageByLead.has(d.lead_id)) stageByLead.set(d.lead_id, d.stage_id)
        }
      }

      const rows = (leads ?? [])
        .filter((l: Record<string, unknown>) =>
          leadMatchesConditions(conds, { ...l, stage_id: stageByLead.get(l.id as string) ?? null }))
        .map((l: Record<string, unknown>) => ({
          cadence_id: cad.id,
          lead_id: l.id as string,
          company_id: cad.company_id,
          current_step: 0,
          status: 'active',
          next_run_at: nowIso,
          initial_stage_id: stageByLead.get(l.id as string) ?? null,
        }))

      if (rows.length > 0) {
        const { count } = await veltzy
          .from('cadence_runs')
          .upsert(rows, { onConflict: 'cadence_id,lead_id', ignoreDuplicates: true, count: 'exact' })
        started += count ?? 0
      }
      await veltzy.from('cadences').update({ recurring_last_run_at: nowIso }).eq('id', cad.id)
    }

    return json({ processed, started }, corsHeaders)
  } catch (err) {
    return json({ error: (err as Error).message }, getCorsHeaders(req), 500)
  }
})

function json(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
