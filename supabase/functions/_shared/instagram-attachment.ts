// Allowlist de mime dos anexos que a Meta aceita no Direct (Instagram DM, Onda 1,
// Spec 5.3 passo 6). Espelhada em src/lib/instagram-attachment.ts; o teste
// instagram-attachment.test.ts garante que as duas listas batem.

export type InstagramAttachmentType = 'image' | 'audio' | 'video' | 'document'

export const INSTAGRAM_ALLOWED_MIME_TYPES: Record<InstagramAttachmentType, readonly string[]> = {
  image: ['image/png', 'image/jpeg'],
  // audio/webm do gravador do Veltzy nao entra: a Meta recusa.
  audio: ['audio/aac', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'],
  video: ['video/mp4', 'video/ogg', 'video/x-msvideo', 'video/quicktime', 'video/webm'],
  document: ['application/pdf'],
}

/** 'Audio/MP4; codecs=x' -> 'audio/mp4'. */
export const normalizeMimeType = (mime: string | null | undefined): string =>
  (mime ?? '').split(';')[0].trim().toLowerCase()

export const isInstagramMimeAllowed = (type: InstagramAttachmentType, mime: string | null | undefined): boolean =>
  INSTAGRAM_ALLOWED_MIME_TYPES[type].includes(normalizeMimeType(mime))
