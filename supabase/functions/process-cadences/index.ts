import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'
import { getCorsHeaders } from '../_shared/cors.ts'
import { decideCadenceAction, type CadenceStepLite } from '../_shared/cadence-engine.ts'
import { getTemplateBodyText, renderTemplateBody, resolveTemplateParams } from '../_shared/blast-render.ts'

// process-cadences (mkt-ativo Corte B): cron que AVANÇA os cadence_runs ativos e
// vencidos (next_run_at<=now). Para cada run: decide (cadence-engine) → cancela
// (opt-out/resposta/stage) / finaliza / espera (agenda next_run_at) / executa o passo.
// EXECUTAR uma msg = ENFILEIRAR na message_queue (reusa fila + envio multi-provider,
// incl. cloud_api/waha do Corte A). NÃO toca run-automations nem process-message-queue.
// O gatilho de START (criação do run) é separado (pendente de produto).

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
    const { data: runs } = await veltzy
      .from('cadence_runs')
      .select('id, cadence_id, lead_id, company_id, current_step, started_at')
      .eq('status', 'active')
      .lte('next_run_at', now.toISOString())
      .order('next_run_at', { ascending: true })
      .limit(20)

    if (!runs || runs.length === 0) {
      return json({ processed: 0 }, corsHeaders)
    }

    let advanced = 0, cancelled = 0, completed = 0, executed = 0, failed = 0, skipped = 0
    // Gate mkt_ativo_enabled por-empresa (à prova de bypass; cache p/ evitar N+1).
    const flagCache = new Map<string, boolean>()
    const isMktAtivoOn = async (companyId: string): Promise<boolean> => {
      if (flagCache.has(companyId)) return flagCache.get(companyId)!
      const { data } = await publicDb.from('companies').select('features').eq('id', companyId).single()
      const on = ((data?.features ?? {}) as Record<string, unknown>).mkt_ativo_enabled === true
      flagCache.set(companyId, on)
      return on
    }

    for (const run of runs) {
      try {
        // Feature desligada p/ a empresa: não processa (não envia). Run fica parado até religar.
        if (!(await isMktAtivoOn(run.company_id))) { skipped++; continue }
        const { data: cadence } = await veltzy
          .from('cadences')
          .select('id, is_enabled, cancel_on_stage_change')
          .eq('id', run.cadence_id)
          .single()
        if (!cadence) { await cancelRun(veltzy, run.id, 'cadence_missing'); cancelled++; continue }
        if (!cadence.is_enabled) { await cancelRun(veltzy, run.id, 'cadence_disabled'); cancelled++; continue }

        const { data: steps } = await veltzy
          .from('cadence_steps')
          .select('action_type, config')
          .eq('cadence_id', run.cadence_id)
          .order('step_order', { ascending: true })

        const { data: lead } = await veltzy
          .from('leads')
          .select('id, phone, name, tags, marketing_opt_out, whatsapp_instance_name')
          .eq('id', run.lead_id)
          .single()
        if (!lead) { await failRun(veltzy, run.id, 'lead_missing'); failed++; continue }

        // Sinais de cancelamento. opt-out e resposta = obrigatórios; stage = fase 2 (flag pronto).
        const { count: replyCount } = await veltzy
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', run.lead_id)
          .eq('sender_type', 'lead')
          .gt('created_at', run.started_at)
        const signals = {
          optOut: !!lead.marketing_opt_out,
          leadResponded: (replyCount ?? 0) > 0,
          stageChanged: false, // TODO Fase 2: detectar mudança de stage (deals) desde started_at
        }

        const decision = decideCadenceAction(
          { current_step: run.current_step },
          (steps ?? []) as CadenceStepLite[],
          signals,
          { cancelOnStageChange: !!cadence.cancel_on_stage_change, now },
        )

        if (decision.kind === 'cancel') {
          await cancelRun(veltzy, run.id, decision.reason); cancelled++
        } else if (decision.kind === 'complete') {
          await veltzy.from('cadence_runs').update({ status: 'completed', completed_at: now.toISOString() }).eq('id', run.id)
          completed++
        } else if (decision.kind === 'wait') {
          await veltzy.from('cadence_runs').update({ current_step: decision.nextStep, next_run_at: decision.nextRunAt }).eq('id', run.id)
          advanced++
        } else {
          // execute
          await executeStep(veltzy, publicDb, decision.step, lead, run.company_id, now)
          await veltzy.from('cadence_runs').update({ current_step: decision.nextStep, next_run_at: decision.nextRunAt }).eq('id', run.id)
          executed++
        }
      } catch (err) {
        console.error('[process-cadences] run failed:', run.id, err)
        await failRun(veltzy, run.id, (err as Error).message).catch(() => {})
        failed++
      }
    }

    return json({ processed: runs.length, advanced, executed, cancelled, completed, failed, skipped }, corsHeaders)
  } catch (err) {
    console.error('[process-cadences] error:', err)
    return json({ error: (err as Error).message }, corsHeaders, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function cancelRun(veltzy: any, id: string, reason: string) {
  await veltzy.from('cadence_runs').update({ status: 'cancelled', cancel_reason: reason, completed_at: new Date().toISOString() }).eq('id', id)
}
// deno-lint-ignore no-explicit-any
async function failRun(veltzy: any, id: string, reason: string) {
  await veltzy.from('cadence_runs').update({ status: 'failed', cancel_reason: reason, completed_at: new Date().toISOString() }).eq('id', id)
}

/** Executa um passo de AÇÃO da cadência (enfileira msg/template, muda tag/stage). */
async function executeStep(
  // deno-lint-ignore no-explicit-any
  veltzy: any,
  // deno-lint-ignore no-explicit-any
  publicDb: any,
  step: CadenceStepLite,
  lead: { id: string; phone: string; name: string | null; tags: string[] | null; whatsapp_instance_name: string | null },
  companyId: string,
  now: Date,
) {
  const cfg = step.config ?? {}
  switch (step.action_type) {
    case 'send_message': {
      await veltzy.from('message_queue').insert({
        company_id: companyId,
        lead_id: lead.id,
        content: String(cfg.content ?? ''),
        message_type: 'text',
        scheduled_at: now.toISOString(),
        source: 'cadence',
        instance_name: lead.whatsapp_instance_name ?? null,
      })
      break
    }
    case 'send_template': {
      const { data: template } = await veltzy
        .from('whatsapp_templates')
        .select('name, language, components')
        .eq('id', String(cfg.template_id ?? ''))
        .single()
      if (!template) throw new Error(`Template ${cfg.template_id} nao encontrado`)
      const bodyText = getTemplateBodyText(template.components)
      const mapping = (cfg.variable_mapping ?? {}) as Record<string, string>
      const { data: company } = await publicDb
        .from('companies').select('active_whatsapp_provider').eq('id', companyId).single()
      const isCloudApi = (company?.active_whatsapp_provider ?? 'zapi') === 'cloud_api'
      const content = renderTemplateBody(bodyText, mapping, lead as unknown as Record<string, unknown>)
      const row: Record<string, unknown> = {
        company_id: companyId,
        lead_id: lead.id,
        content,
        scheduled_at: now.toISOString(),
        source: 'cadence',
        instance_name: lead.whatsapp_instance_name ?? null,
        message_type: isCloudApi ? 'template' : 'text',
      }
      if (isCloudApi) {
        row.metadata = {
          template_name: template.name,
          language: template.language,
          params: resolveTemplateParams(bodyText, mapping, lead as unknown as Record<string, unknown>),
        }
      }
      await veltzy.from('message_queue').insert(row)
      break
    }
    case 'add_tag': {
      const tag = String(cfg.tag ?? '')
      const tags = Array.from(new Set([...(lead.tags ?? []), tag])).filter(Boolean)
      await veltzy.from('leads').update({ tags }).eq('id', lead.id)
      break
    }
    case 'remove_tag': {
      const tag = String(cfg.tag ?? '')
      const tags = (lead.tags ?? []).filter((t: string) => t !== tag)
      await veltzy.from('leads').update({ tags }).eq('id', lead.id)
      break
    }
    case 'change_stage': {
      // Espelha run-automations: move o deal ABERTO mais recente (stage vive em deals).
      const { data: deal } = await veltzy
        .from('deals').select('id').eq('lead_id', lead.id).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (deal) await veltzy.from('deals').update({ stage_id: cfg.stage_id }).eq('id', deal.id)
      break
    }
  }
}

function json(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
