import type { LeadWithLastMessage } from '@/types/database'

/** Prazo padrao de resposta ao lead, em horas (mesmo default de business_rules.sla_hours). */
export const DEFAULT_RESPONSE_SLA_HOURS = 2

type SlaLead = Pick<LeadWithLastMessage, 'conversation_status' | 'last_message'>

/**
 * Converte o sla_hours das regras de negocio em milissegundos.
 * Valor ausente, zero ou invalido cai no padrao de 2h (antes o check-sla caia em 30 min).
 */
export const responseSlaMs = (slaHours: number | null | undefined): number => {
  const hours = Number(slaHours)
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_RESPONSE_SLA_HOURS) * 60 * 60 * 1000
}

/**
 * A conversa tem resposta pendente quando a ultima mensagem visivel (a RPC
 * get_conversation_list ja ignora notas internas) foi do lead. Resposta do
 * vendedor (human) ou da IA (ai) encerra a pendencia.
 */
export const hasPendingReply = (lead: SlaLead): boolean =>
  lead.conversation_status !== 'resolved' &&
  lead.last_message?.sender_type === 'lead'

/**
 * Atraso de resposta: pendencia ha MAIS que o prazo. Exatamente no prazo nao conta.
 * O relogio parte da ultima mensagem do lead (a que esta pendente agora), e nao
 * de leads.sla_breached: essa flag e gravada pelo cron check-sla e ficava presa
 * em true depois da resposta e quando o lead voltava a escrever.
 */
export const isResponseOverdue = (lead: SlaLead, slaMs: number, now: number): boolean => {
  if (!hasPendingReply(lead)) return false
  const since = new Date(lead.last_message?.created_at ?? '').getTime()
  if (Number.isNaN(since)) return false
  return now - since > slaMs
}
