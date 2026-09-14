/** Copy pt-BR dos erros do Instagram DM (Onda 1). Sem travessao. */

export const INSTAGRAM_WINDOW_CLOSED_MESSAGE =
  'O contato precisa mandar uma nova mensagem para você responder pelo Instagram.'

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  conta_em_outra_empresa: 'Esta conta do Instagram já está conectada a outra empresa no Veltzy.',
  state_invalido: 'O link de conexão expirou. Tente conectar de novo.',
  instagram_nao_habilitado: 'O Instagram não está habilitado para a sua empresa. Fale com o suporte.',
  access_denied: 'Conexão cancelada no Instagram.',
}

const OAUTH_GENERIC_MESSAGE = 'Não foi possível conectar o Instagram. Tente de novo.'

export const instagramOAuthErrorMessage = (code: string | null): string =>
  (code && OAUTH_ERROR_MESSAGES[code]) || OAUTH_GENERIC_MESSAGE

const SEND_ERROR_MESSAGES: Record<string, string> = {
  instagram_window_closed: INSTAGRAM_WINDOW_CLOSED_MESSAGE,
  instagram_desconectado: 'O Instagram da empresa está desconectado. Peça a um administrador para reconectar.',
  formato_nao_suportado_instagram: 'Formato não aceito pelo Instagram. Envie PNG, JPEG, vídeo, áudio (AAC, M4A ou WAV) ou PDF.',
  arquivo_muito_grande_instagram: 'Arquivo muito grande para o Instagram. Imagem até 8MB, demais até 25MB.',
  lead_sem_instagram: 'Este contato não tem Instagram vinculado.',
  lead_sem_whatsapp: 'Este contato não tem WhatsApp. Responda pelo Instagram.',
}

/** null quando o codigo nao e de envio conhecido (o chamador usa a mensagem generica dele). */
export const sendErrorMessage = (code: string | null): string | null =>
  (code && SEND_ERROR_MESSAGES[code]) || null
