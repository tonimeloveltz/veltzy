// Anexo da campanha (texto livre, número não oficial). Arquivo no bucket chat-attachments,
// pasta da empresa (RLS por pasta), expurgado 30 dias após a campanha terminar.
import type { CampaignMediaType } from '@/types/database'

export const MEDIA_BUCKET = 'chat-attachments'
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024
export const MEDIA_ACCEPT =
  'image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip'

export const mediaTypeFromMime = (mime: string): CampaignMediaType =>
  mime.startsWith('image/') ? 'image'
    : mime.startsWith('video/') ? 'video'
    : mime.startsWith('audio/') ? 'audio'
    : 'document'

/**
 * Nome seguro para o path: sem acento, espaços viram '-', só [a-zA-Z0-9._-], extensão
 * preservada. É o nome que o WhatsApp mostra no documento.
 */
export const sanitizeMediaName = (name: string): string => {
  const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const dot = name.lastIndexOf('.')
  const rawBase = dot > 0 ? name.slice(0, dot) : name
  const rawExt = dot > 0 ? name.slice(dot) : ''
  const base = ascii(rawBase)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || 'arquivo'
  const ext = ascii(rawExt).replace(/[^a-zA-Z0-9.]/g, '')
  return `${base}${ext}`
}

/** <company_id>/campaigns/<uuid>/<nome-sanitizado> */
export const buildMediaPath = (companyId: string, file: File): string =>
  `${companyId}/campaigns/${crypto.randomUUID()}/${sanitizeMediaName(file.name)}`
