import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'
import { getCorsHeaders } from '../_shared/cors.ts'
import { queueStatusToRecipient, isCampaignComplete, followupTargets, type RecipientLite } from '../_shared/blast-followup.ts'

// process-blast-followups (mkt-ativo Fase 2, cron): ADITIVO, NÃO toca o process-message-queue.
// (1) reconcilia blast_recipients.status ← message_queue.status; (2) marca campanha 'completed'
// quando todos os recipients terminam (resolve o débito de acompanhamento da Fase 1);
// (3) dispara follow-up (immediate | no_reply após delay) inscrevendo os leads na cadência.

const DAY_MS = 86_400_000

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!isCronAuthorized(req)) return cronUnauthorized(corsHeaders)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })
    const now = new Date()
    let reconciled = 0, completed = 0, followedUp = 0

    // (1) RECONCILIAÇÃO: recipients ainda não-terminais que já têm item na fila.
    const { data: pend } = await veltzy
      .from('blast_recipients')
      .select('id, message_queue_id')
      .in('status', ['pending', 'queued'])
      .not('message_queue_id', 'is', null)
      .limit(500)
    for (const r of pend ?? []) {
      const { data: mq } = await veltzy.from('message_queue').select('status, sent_at').eq('id', r.message_queue_id).maybeSingle()
      if (!mq) continue
      const rs = queueStatusToRecipient(mq.status)
      if (rs) {
        await veltzy.from('blast_recipients').update({ status: rs, sent_at: mq.sent_at ?? null }).eq('id', r.id)
        reconciled++
      }
    }

    // (2) COMPLETION: campanhas em voo cujos recipients estão todos terminais.
    const { data: camps } = await veltzy.from('blast_campaigns').select('id').in('status', ['queued', 'running']).limit(200)
    for (const c of camps ?? []) {
      const { data: recs } = await veltzy.from('blast_recipients').select('status').eq('campaign_id', c.id)
      const statuses = (recs ?? []).map((x: { status: string }) => x.status)
      if (isCampaignComplete(statuses)) {
        await veltzy.from('blast_campaigns').update({
          status: 'completed',
          completed_at: now.toISOString(),
          sent_count: statuses.filter((s) => s === 'sent').length,
          failed_count: statuses.filter((s) => s === 'failed').length,
        }).eq('id', c.id)
        completed++
      }
    }

    // (3) FOLLOW-UP: campanhas completed, com cadência configurada e ainda não disparada.
    const { data: fu } = await veltzy
      .from('blast_campaigns')
      .select('id, company_id, followup_cadence_id, followup_mode, followup_delay_days, completed_at')
      .eq('status', 'completed')
      .neq('followup_mode', 'none')
      .is('followup_done_at', null)
      .not('followup_cadence_id', 'is', null)
      .limit(100)
    for (const c of fu ?? []) {
      const mode = c.followup_mode as 'immediate' | 'no_reply'
      // no_reply espera followup_delay_days após completar.
      if (mode === 'no_reply' && c.completed_at) {
        const readyAt = new Date(c.completed_at).getTime() + Number(c.followup_delay_days ?? 0) * DAY_MS
        if (now.getTime() < readyAt) continue // ainda no período de espera
      }
      const { data: recs } = await veltzy.from('blast_recipients').select('lead_id, status').eq('campaign_id', c.id)

      // no_reply: quem respondeu desde que a campanha completou (aproximação por completed_at).
      const responded = new Set<string>()
      if (mode === 'no_reply') {
        const sentLeadIds = (recs ?? []).filter((r: RecipientLite) => r.status === 'sent' && r.lead_id).map((r: RecipientLite) => r.lead_id as string)
        if (sentLeadIds.length > 0) {
          const { data: replies } = await veltzy
            .from('messages').select('lead_id')
            .in('lead_id', sentLeadIds).eq('sender_type', 'lead').gt('created_at', c.completed_at)
          for (const m of replies ?? []) responded.add(m.lead_id as string)
        }
      }

      const targets = followupTargets((recs ?? []) as RecipientLite[], mode, responded)
      if (targets.length > 0) {
        const rows = targets.map((lead_id) => ({
          cadence_id: c.followup_cadence_id,
          lead_id,
          company_id: c.company_id,
          current_step: 0,
          status: 'active',
          next_run_at: now.toISOString(),
        }))
        await veltzy.from('cadence_runs').upsert(rows, { onConflict: 'cadence_id,lead_id', ignoreDuplicates: true })
        followedUp += targets.length
      }
      // marca disparado mesmo se 0 alvos (evita re-checagem infinita).
      await veltzy.from('blast_campaigns').update({ followup_done_at: now.toISOString() }).eq('id', c.id)
    }

    return new Response(JSON.stringify({ reconciled, completed, followedUp }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[process-blast-followups] error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
