import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'
import { getCorsHeaders } from '../_shared/cors.ts'
import { purgeCampaignMedia } from '../_shared/campaign-media-purge.ts'
import { queueStatusToRecipient, campaignProgress, followupTargets, scheduledStartAt, type RecipientLite } from '../_shared/blast-followup.ts'

// process-blast-followups (mkt-ativo Fase 2, cron): ADITIVO, NÃO toca o process-message-queue.
// (1) reconcilia blast_recipients.status ← message_queue.status; (2) grava sent_count/failed_count
// a cada rodada e marca campanha 'completed' quando todos os recipients terminam (inclui 'scheduled': o passo (1b) leva a 'running'
// quando scheduled_at chega) (resolve o débito de acompanhamento da Fase 1);
// (3) dispara follow-up (immediate | no_reply após delay) inscrevendo os leads na cadência;
// (4) expurga o anexo de campanhas terminadas há 30+ dias (campanhas-layout-midia).

const DAY_MS = 86_400_000

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!isCronAuthorized(req)) return cronUnauthorized(corsHeaders)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })
    const storageClient = createClient(url, key)
    const now = new Date()
    let reconciled = 0, progressed = 0, completed = 0, followedUp = 0, mediaPurged = 0

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

    // (1b) AGENDADAS: 'scheduled' cujo scheduled_at chegou → 'running' (started_at = scheduled_at).
    const { data: due } = await veltzy
      .from('blast_campaigns')
      .select('id, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now.toISOString())
      .limit(200)
    for (const c of due ?? []) {
      const startedAt = scheduledStartAt(c.scheduled_at, now)
      if (!startedAt) continue
      await veltzy.from('blast_campaigns').update({ status: 'running', started_at: startedAt })
        .eq('id', c.id).eq('status', 'scheduled')
    }

    // (2) PROGRESSO + COMPLETION: a cada rodada grava sent_count/failed_count das campanhas
    // em voo (a lista lê esses campos; antes só eram gravados no fim e ficavam 0 durante o
    // envio). Inclui 'scheduled' para o caso de tudo já estar terminal (ex.: todos skipped).
    // Contagem no servidor com head:true: o max_rows (1000) não se aplica a count, então NÃO
    // trocar por select de linhas + .length (era o que truncava campanhas grandes).
    const countRecipients = async (campaignId: string, statuses?: string[]): Promise<number> => {
      let q = veltzy.from('blast_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId)
      if (statuses) q = q.in('status', statuses)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    }
    const { data: camps } = await veltzy.from('blast_campaigns').select('id, sent_count, failed_count').in('status', ['scheduled', 'queued', 'running']).limit(200)
    for (const c of camps ?? []) {
      // Falha de contagem numa campanha não derruba as outras nem os passos (3) e (4).
      try {
        const [total, open, sent, failed] = await Promise.all([
          countRecipients(c.id),
          countRecipients(c.id, ['pending', 'queued']),
          countRecipients(c.id, ['sent']),
          countRecipients(c.id, ['failed']),
        ])
        const progress = campaignProgress({ total, open, sent, failed })
        if (progress.complete) {
          await veltzy.from('blast_campaigns').update({
            status: 'completed',
            completed_at: now.toISOString(),
            sent_count: progress.sent,
            failed_count: progress.failed,
          }).eq('id', c.id)
          completed++
        } else if (progress.sent !== c.sent_count || progress.failed !== c.failed_count) {
          // Só o contador: status segue com o (1b) e com o dispatch.
          await veltzy.from('blast_campaigns').update({ sent_count: progress.sent, failed_count: progress.failed }).eq('id', c.id)
          progressed++
        }
      } catch (err) {
        console.error(`[process-blast-followups] progresso da campanha ${c.id}:`, err)
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

    // (4) EXPURGO do anexo: falha aqui não derruba os passos anteriores.
    try {
      mediaPurged = await purgeCampaignMedia(veltzy, storageClient, now)
    } catch (err) {
      console.error('[process-blast-followups] purge error:', err)
    }

    return new Response(JSON.stringify({ reconciled, progressed, completed, followedUp, mediaPurged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[process-blast-followups] error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
