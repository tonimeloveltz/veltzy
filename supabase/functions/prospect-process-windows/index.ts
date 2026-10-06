import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { composeProspectDm } from '../_shared/prospect-compose-dm.ts'

// Processa as janelas de mensagens de grupo cruas: dedup logico engine-independente,
// classifica via prospect-classify, grava prospect_signals por faixa e dispara auto_dm
// (so !shadow && dm_auto) / alerta (tarefa). Invocado pelo cron SQL (x-cron-secret).
// Cron NAO agenda ainda (deferido); teste manual depois. verify_jwt=false.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const WINDOW_NEIGHBORS = 5   // mensagens anteriores (mesmo grupo) como contexto
const MAX_MESSAGES_PER_RUN = 50

interface RawRow {
  id: string
  company_id: string
  group_id: string
  group_jid: string
  engine: string | null
  message_external_id: string
  author_identifier: string | null
  author_key: string | null
  author_phone_resolved: string | null
  text: string | null
  received_at: string
}

type Decision = 'auto_dm' | 'review' | 'alert' | 'discard'

function decide(
  isOpportunity: boolean,
  probability: number | null,
  hasPhone: boolean,
  thresholdAuto: number,
  thresholdReview: number,
): Decision {
  if (isOpportunity !== true) return 'discard'
  if (!hasPhone) return 'alert'                         // oportunidade sem telefone DM-able (@lid)
  if (probability != null) {
    if (probability >= thresholdAuto) return 'auto_dm'
    if (probability >= thresholdReview) return 'review'
    return 'discard'
  }
  return 'review'                                       // prob null (pre-H3b): nunca auto_dm sem prob calibrada
}

async function invokeEdge(name: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify(body),
  })
  let json: Record<string, unknown> = {}
  try { json = await res.json() } catch { /* sem corpo */ }
  return { status: res.status, json }
}

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405, headers)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'veltzy' } })

  // Auth: x-cron-secret vs prospect_cron_config.cron_secret (mesma chave que o job SQL manda).
  const { data: cronCfg } = await supabase
    .from('prospect_cron_config').select('cron_secret').eq('job_key', 'process_windows').maybeSingle()
  const expected = cronCfg?.cron_secret ?? ''
  const got = req.headers.get('x-cron-secret') ?? ''
  if (!expected || got !== expected) return json({ ok: false, error: 'invalid cron secret' }, 401, headers)

  try {
    // Raw pendente de grupos registrados (group_id not null — signals.group_id e NOT NULL).
    const { data: rawRows } = await supabase
      .from('prospect_group_messages_raw')
      .select('id, company_id, group_id, group_jid, engine, message_external_id, author_identifier, author_key, author_phone_resolved, text, received_at')
      .eq('classified', false)
      .not('group_id', 'is', null)
      .order('received_at', { ascending: true })
      .limit(MAX_MESSAGES_PER_RUN * 3)   // folga pro dedup por engine
    const rows = (rawRows ?? []) as RawRow[]
    if (rows.length === 0) return json({ ok: true, processed: 0, signals: 0 }, 200, headers)

    // Agrupa por (company_id, group_id).
    const byGroup = new Map<string, RawRow[]>()
    for (const r of rows) {
      const k = `${r.company_id}::${r.group_id}`
      const arr = byGroup.get(k) ?? []
      arr.push(r)
      byGroup.set(k, arr)
    }

    // Cache de config/criteria por empresa.
    const cfgCache = new Map<string, { shadow: boolean; dmAuto: boolean }>()
    const critCache = new Map<string, { niche: string | null; thrAuto: number; thrReview: number } | null>()

    let processed = 0
    let signalsCreated = 0

    for (const [, groupRows] of byGroup) {
      if (processed >= MAX_MESSAGES_PER_RUN) break
      const companyId = groupRows[0].company_id
      const groupId = groupRows[0].group_id

      // config da empresa
      if (!cfgCache.has(companyId)) {
        const { data: cfg } = await supabase
          .from('prospect_config').select('shadow_mode, dm_auto_enabled').eq('company_id', companyId).maybeSingle()
        cfgCache.set(companyId, { shadow: cfg?.shadow_mode !== false, dmAuto: cfg?.dm_auto_enabled === true })
      }
      if (!critCache.has(companyId)) {
        const { data: crit } = await supabase
          .from('prospect_criteria').select('niche, threshold_auto, threshold_review').eq('company_id', companyId).eq('is_active', true).limit(1).maybeSingle()
        critCache.set(companyId, crit ? { niche: crit.niche, thrAuto: Number(crit.threshold_auto), thrReview: Number(crit.threshold_review) } : null)
      }
      const cfg = cfgCache.get(companyId)!
      const crit = critCache.get(companyId)
      if (!crit) continue   // empresa sem criterio ativo: nao classifica

      const { data: group } = await supabase.from('prospect_groups').select('name, niche').eq('id', groupId).maybeSingle()
      const groupName: string | null = group?.name ?? null
      const niche = group?.niche ?? crit.niche ?? undefined

      // DEDUP LOGICO engine-independente por (group_jid, message_external_id, author_key),
      // preferindo a linha com author_phone_resolved nao-nulo.
      const logical = new Map<string, RawRow>()
      for (const r of groupRows) {
        const k = `${r.group_jid}::${r.message_external_id}::${r.author_key ?? ''}`
        const prev = logical.get(k)
        if (!prev || (!prev.author_phone_resolved && r.author_phone_resolved)) logical.set(k, r)
      }
      const candidates = [...logical.values()].sort((a, b) => a.received_at.localeCompare(b.received_at))

      for (let i = 0; i < candidates.length; i++) {
        if (processed >= MAX_MESSAGES_PER_RUN) break
        const cand = candidates[i]
        const target = (cand.text ?? '').trim()
        if (!target) { await markClassified(supabase, cand); continue }

        // Janela: N mensagens anteriores do mesmo grupo como contexto (sem PII, so texto).
        const context = candidates.slice(Math.max(0, i - WINDOW_NEIGHBORS), i).map((c) => (c.text ?? '').trim()).filter(Boolean)

        const cls = await invokeEdge('prospect-classify', { company_id: companyId, niche, target, context })
        processed++
        if (cls.status !== 200 || (cls.json as { ok?: boolean }).ok !== true) {
          // falha de classificacao: deixa classified=false pra retry no proximo run
          continue
        }
        const data = (cls.json as { data: { is_opportunity: boolean; category: string; urgency: number; probability: number | null; confidence: number | null; provider: string } }).data
        const hasPhone = !!cand.author_phone_resolved
        const decision = decide(data.is_opportunity, data.probability, hasPhone, crit.thrAuto, crit.thrReview)

        const { data: signalRow } = await supabase.from('prospect_signals').upsert({
          company_id: companyId,
          group_id: groupId,
          message_external_id: cand.message_external_id,
          author_identifier: cand.author_identifier,
          author_phone_resolved: cand.author_phone_resolved,
          snippet: target,
          is_opportunity: data.is_opportunity,
          category: data.category || null,
          urgency: data.urgency ?? null,
          probability: data.probability,
          confidence: data.confidence,
          provider: data.provider,
          decision,
          status: 'pending',
          shadow: cfg.shadow,
        }, { onConflict: 'company_id,message_external_id', ignoreDuplicates: true }).select('id')

        const signalId: string | null = signalRow?.[0]?.id ?? null
        if (signalId) signalsCreated++

        // auto_dm: so quando NAO shadow E dm_auto ligado. (dm-send revalida tudo.)
        if (signalId && decision === 'auto_dm' && !cfg.shadow && cfg.dmAuto) {
          try {
            const text = await composeProspectDm({ companyId, snippet: target, category: data.category || null, groupName })
            await invokeEdge('prospect-dm-send', { signal_id: signalId, message_text: text })
          } catch (e) {
            console.error('[process-windows] auto_dm falhou:', (e as Error).message)
          }
        }

        // alert: tarefa pro Toni (grupo + trecho + signal_id).
        if (signalId && decision === 'alert') {
          await supabase.from('tasks').insert({
            company_id: companyId,
            type: 'todo',
            status: 'pending',
            title: `Prospecção: oportunidade sem telefone${groupName ? ` — ${groupName}` : ''}`,
            description: `${target}\n\n(sinal ${signalId}: autor sem telefone DM-able; abordar manualmente)`,
          })
        }

        await markClassified(supabase, cand)
      }
    }

    return json({ ok: true, processed, signals: signalsCreated }, 200, headers)
  } catch (err) {
    console.error('[prospect-process-windows]', err)
    return json({ ok: false, error: (err as Error).message }, 500, headers)
  }
})

// Marca classified=true para TODAS as linhas (engines) daquele message_external_id no grupo.
// deno-lint-ignore no-explicit-any
async function markClassified(supabase: any, cand: RawRow): Promise<void> {
  await supabase.from('prospect_group_messages_raw')
    .update({ classified: true })
    .eq('company_id', cand.company_id)
    .eq('group_jid', cand.group_jid)
    .eq('message_external_id', cand.message_external_id)
}
