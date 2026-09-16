/**
 * Validacao de anexo antes do upload numa conversa do Instagram (Instagram DM, Onda 1).
 *
 * Espelho de supabase/functions/_shared/instagram-attachment.ts: o instagram-send
 * aplica a mesma allowlist e e a autoridade. Sem import neste arquivo, porque o
 * teste Deno do servidor importa daqui para garantir que as listas batem.
 */

export type InstagramAttachmentType = 'image' | 'audio' | 'video' | 'document'

export type InstagramAttachmentError = 'formato_nao_suportado_instagram' | 'arquivo_muito_grande_instagram'

export const INSTAGRAM_ALLOWED_MIME_TYPES: Record<InstagramAttachmentType, readonly string[]> = {
  image: ['image/png', 'image/jpeg'],
  // audio/webm do gravador do Veltzy nao entra: a Meta recusa.
  audio: ['audio/aac', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'],
  video: ['video/mp4', 'video/ogg', 'video/x-msvideo', 'video/quicktime', 'video/webm'],
  document: ['application/pdf'],
}

const MB = 1024 * 1024

export const INSTAGRAM_MAX_BYTES: Record<InstagramAttachmentType, number> = {
  image: 8 * MB,
  audio: 25 * MB,
  video: 25 * MB,
  document: 25 * MB,
}

const normalizeMimeType = (mime: string): string => mime.split(';')[0].trim().toLowerCase()

/** Mesmo criterio do chat-input para escolher o message_type. */
const attachmentType = (mime: string): InstagramAttachmentType =>
  mime.startsWith('image/') ? 'image'
    : mime.startsWith('audio/') ? 'audio'
    : mime.startsWith('video/') ? 'video'
    : 'document'

/** Codigo de erro (copy em instagram-messages.ts) ou null quando o anexo pode subir. */
export const validateInstagramAttachment = (file: { type: string; size: number }): InstagramAttachmentError | null => {
  const mime = normalizeMimeType(file.type)
  const type = attachmentType(mime)
  if (!INSTAGRAM_ALLOWED_MIME_TYPES[type].includes(mime)) return 'formato_nao_suportado_instagram'
  if (file.size > INSTAGRAM_MAX_BYTES[type]) return 'arquivo_muito_grande_instagram'
  return null
}
