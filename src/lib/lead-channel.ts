/**
 * Canal do contato (Instagram DM, Onda 1).
 *
 * Lead do Instagram carrega `phone = 'ig_<IGSID>'` (placeholder, PRD D4): nunca
 * exibido, nunca enviado ao WhatsApp. Estas funcoes sao a unica regra do front
 * para decidir exibicao, janela e canal de envio.
 */

export const isInstagramPlaceholderPhone = (phone: string | null | undefined): boolean =>
  !!phone && phone.startsWith('ig_')

const hasRealPhone = (phone: string | null | undefined): boolean =>
  !!phone && phone.trim() !== '' && !isInstagramPlaceholderPhone(phone)

/** Placeholder vira '@handle' (ou 'Instagram' sem handle); telefone real passa como veio. */
export const leadContactLabel = (lead: { phone: string; instagram_handle?: string | null }): string => {
  if (!isInstagramPlaceholderPhone(lead.phone)) return lead.phone
  const handle = lead.instagram_handle?.trim().replace(/^@/, '')
  return handle ? `@${handle}` : 'Instagram'
}

/** Conversa acontece no Instagram: placeholder, ou instagram_id sem telefone real. */
export const isInstagramConversation = (lead: { phone: string | null; instagram_id?: string | null }): boolean =>
  isInstagramPlaceholderPhone(lead.phone) || (!!lead.instagram_id && !hasRealPhone(lead.phone))

export type InstagramWindowState = 'open' | 'closing' | 'closed'

const HOUR_MS = 60 * 60 * 1000
const WINDOW_MS = 24 * HOUR_MS
const CLOSING_MS = 2 * HOUR_MS

/** Milissegundos ate a janela de 24h fechar (0 quando ja fechou ou nao ha mensagem). */
export const instagramWindowRemainingMs = (lastCustomerMessageAt: string | null, now: Date): number => {
  if (!lastCustomerMessageAt) return 0
  const last = new Date(lastCustomerMessageAt).getTime()
  if (Number.isNaN(last)) return 0
  return Math.max(0, last + WINDOW_MS - now.getTime())
}

/**
 * closing = menos de 2h para fechar. Aproximacao de UX: o servidor e a
 * autoridade (instagram-send calcula so com mensagens do Instagram).
 */
export const instagramWindowState = (lastCustomerMessageAt: string | null, now: Date): InstagramWindowState => {
  const remaining = instagramWindowRemainingMs(lastCustomerMessageAt, now)
  if (remaining <= 0) return 'closed'
  if (remaining < CLOSING_MS) return 'closing'
  return 'open'
}

export type OutboundChannel = 'whatsapp' | 'instagram' | 'manual'

export interface OutboundChannelInput {
  lastInboundSource: string | null
  phone: string | null
  instagramId: string | null
  whatsAppConnected: boolean
  instagramConnected: boolean
}

/** PRD D5: responde no canal da ultima mensagem do contato, com fallback por dado disponivel. */
export const decideOutboundChannel = (input: OutboundChannelInput): OutboundChannel => {
  const realPhone = hasRealPhone(input.phone)
  const canInstagram = input.instagramConnected && !!input.instagramId

  if (input.lastInboundSource === 'instagram' && canInstagram) return 'instagram'
  if (input.lastInboundSource === 'whatsapp' && realPhone && input.whatsAppConnected) return 'whatsapp'
  if (realPhone && input.whatsAppConnected) return 'whatsapp'
  if (canInstagram) return 'instagram'
  return 'manual'
}
