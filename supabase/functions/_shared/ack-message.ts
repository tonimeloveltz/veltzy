// Gêmea de src/lib/needs-reply.ts (isAckMessage): Deno não importa de src/.
// Mudou a regra aqui, muda lá também.

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
