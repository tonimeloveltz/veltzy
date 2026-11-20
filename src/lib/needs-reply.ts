import type { LeadWithLastMessage } from '@/types/database'
import { responseSlaMs } from '@/lib/response-sla'

// Gêmea em supabase/functions/_shared/ack-message.ts (Deno não importa de src/).
// Mudou a regra aqui, muda lá também.

type NeedsReplyLead = Pick<LeadWithLastMessage, 'conversation_status' | 'last_message'>

/** Palavras de fechamento: mensagem feita só delas não pede resposta. */
const CLOSING_WORDS = new Set([
  'ok', 'okay', 'oks', 'okk', 'blz', 'blza', 'beleza',
  'obrigado', 'obrigada', 'obg', 'obgd', 'brigado', 'brigada', 'valeu', 'vlw',
  'combinado', 'perfeito', 'perfeita', 'certo', 'certa', 'certinho', 'show', 'top',
  'otimo', 'otima', 'sim', 'ss', 'entendi', 'fechado', 'tranquilo', 'tranquila',
  'tmj', 'joia', 'legal', 'massa', 'bom', 'boa', 'dia', 'tarde', 'noite',
  'muito', 'muita', 'pelo', 'pela', 'envio', 'de', 'nada', 'ta', 'to', 'e', 'isso',
  'ate', 'mais', 'ah',
])

/** Risada (kkk, rsrs, haha) conta como fechamento. */
const LAUGH = /^(k{2,}|(rs)+|(ha){2,}|(he){2,})$/

const MAX_ACK_LENGTH = 40

const stripEmoji = (s: string): string =>
  s.replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f|\u20e3/gu, '')

const normalize = (s: string): string =>
  stripEmoji(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Mensagem de fechamento ("Ok 👍", "Combinado", "Obrigado pelo envio", sticker,
 * reação): não pede resposta. Áudio, imagem, documento e vídeo podem pedir.
 */
export const isAckMessage = (content: string | null, messageType: string): boolean => {
  if (messageType === 'sticker' || messageType === 'reaction') return true
  if (messageType !== 'text') return false
  const text = normalize(content ?? '')
  if (!text) return true
  if (text.length > MAX_ACK_LENGTH) return false
  return text.split(' ').every((w) => CLOSING_WORDS.has(w) || LAUGH.test(w))
}

/** A conversa espera resposta: última mensagem do lead, que não é fechamento, em conversa aberta. */
export const needsReply = (lead: NeedsReplyLead): boolean => {
  const msg = lead.last_message
  if (!msg || msg.sender_type !== 'lead') return false
  if (lead.conversation_status === 'resolved' || lead.conversation_status === 'waiting_client') return false
  return !isAckMessage(msg.content, msg.message_type)
}

/** Espera resposta há mais que o prazo (sla_hours; inválido ou <= 0 cai em 2h). */
export const isOverdue = (lead: NeedsReplyLead, slaHours: number | null | undefined, now: number = Date.now()): boolean => {
  if (!needsReply(lead)) return false
  const since = new Date(lead.last_message?.created_at ?? '').getTime()
  if (Number.isNaN(since)) return false
  return now - since > responseSlaMs(slaHours)
}
