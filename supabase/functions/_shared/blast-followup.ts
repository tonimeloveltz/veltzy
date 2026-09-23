// Lógica PURA do follow-up campanha→cadência (mkt-ativo Fase 2). O cron
// process-blast-followups faz as queries; aqui só as decisões (testáveis).

const TERMINAL = new Set(['sent', 'failed', 'skipped'])

/** Mapeia message_queue.status → blast_recipients.status. pending = não-terminal (null = manter). */
export function queueStatusToRecipient(queueStatus: string): 'sent' | 'failed' | 'skipped' | null {
  switch (queueStatus) {
    case 'sent': return 'sent'
    case 'failed': return 'failed'
    case 'cancelled': return 'skipped'
    default: return null // pending → mantém como está
  }
}

/** Campanha completa = tem recipients e TODOS em estado terminal (sent/failed/skipped). */
export function isCampaignComplete(recipientStatuses: string[]): boolean {
  return recipientStatuses.length > 0 && recipientStatuses.every((s) => TERMINAL.has(s))
}

export interface RecipientLite {
  lead_id: string | null
  status: string
}

/**
 * lead_ids que entram na cadência de follow-up.
 * - immediate: todos os recipients SENT.
 * - no_reply: recipients SENT que NÃO responderam (lead_id ∉ respondedLeadIds).
 */
export function followupTargets(
  recipients: RecipientLite[],
  mode: 'immediate' | 'no_reply',
  respondedLeadIds: Set<string>,
): string[] {
  const out: string[] = []
  for (const r of recipients) {
    if (r.status !== 'sent' || !r.lead_id) continue
    if (mode === 'no_reply' && respondedLeadIds.has(r.lead_id)) continue
    out.push(r.lead_id)
  }
  return out
}
