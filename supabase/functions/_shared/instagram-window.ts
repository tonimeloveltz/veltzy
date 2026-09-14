// Janela de resposta do Instagram (Instagram DM, Onda 1, PRD D7).
// A Meta so permite responder quem escreveu: 24h livres a partir da ultima
// mensagem do contato. A tag HUMAN_AGENT estende para 7 dias, so para humano,
// e fica atras de flag ate a Meta aprovar a tag.

export type InstagramWindow = 'open' | 'human_agent' | 'closed'

const HOUR_MS = 60 * 60 * 1000
const STANDARD_WINDOW_MS = 24 * HOUR_MS
const HUMAN_AGENT_WINDOW_MS = 7 * 24 * HOUR_MS

export const decideInstagramWindow = (
  lastInboundAt: Date | null,
  now: Date,
  humanAgentEnabled: boolean,
): InstagramWindow => {
  if (!lastInboundAt || Number.isNaN(lastInboundAt.getTime())) return 'closed'
  const elapsed = now.getTime() - lastInboundAt.getTime()
  if (elapsed <= STANDARD_WINDOW_MS) return 'open'
  if (humanAgentEnabled && elapsed <= HUMAN_AGENT_WINDOW_MS) return 'human_agent'
  return 'closed'
}
