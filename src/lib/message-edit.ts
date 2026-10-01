import type { Message } from '@/types/database'

/** Limite do WhatsApp, nao nosso. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/**
 * Regra de quando a acao de editar aparece na bolha.
 *
 * Mora aqui, e nao em message-bubble.tsx, por duas razoes: e testavel sem UI, e
 * o react-refresh reclama de arquivo de componente que exporta outra coisa.
 *
 * Sobre o gate de provider: so Evolution e WAHA editam. Exigir o valor
 * explicito (e nao "diferente de cloud_api") esconde o lapis tambem nas
 * mensagens de whatsapp_provider NULL, que sao as anteriores ao carimbo no
 * whatsapp-send. Isso nao perde nenhuma mensagem editavel: as de Evolution/WAHA
 * daquela epoca tambem estao sem external_id e ja caem no gate de cima. O que
 * some sao as de Cloud API antigas, que nunca foram editaveis mesmo.
 *
 * A janela e checada no render, entao uma bolha aberta ha tempo pode mostrar o
 * lapis depois de expirado ate o proximo re-render. Isso e de proposito: o gate
 * daqui e conveniencia, a verdade e o whatsapp-edit, que devolve a frase certa.
 */
export const canEditMessage = (message: Message): boolean =>
  message.sender_type !== 'lead' &&
  message.message_type === 'text' &&
  message.delivery_status !== 'failed' &&
  (message.whatsapp_provider === 'evolution' || message.whatsapp_provider === 'waha') &&
  !!message.external_id &&
  !message.id.startsWith('optimistic-') &&
  Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS
