import { supabase } from '@/lib/supabase'

export type EventAssetKind = 'logo' | 'banner'

const BUCKET = 'event-assets'
const MAX_BYTES: Record<EventAssetKind, number> = { logo: 2 * 1024 * 1024, banner: 5 * 1024 * 1024 }
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export class EventAssetError extends Error {}

/** Recusa antes de enviar: o bucket aceita ate 5 MB e so JPG, PNG e WebP. */
export const validateEventAsset = (kind: EventAssetKind, file: File): string | null => {
  if (!EXT[file.type]) return 'Use uma imagem JPG, PNG ou WebP.'
  if (file.size > MAX_BYTES[kind]) return kind === 'logo' ? 'O logo pode ter até 2 MB.' : 'O banner pode ter até 5 MB.'
  return null
}

/** Sobe em event-assets/<company_id>/<event_id>/<logo|banner>-<uuid>.<ext> e devolve o caminho. */
export const uploadEventAsset = async (
  companyId: string, eventId: string, kind: EventAssetKind, file: File,
): Promise<string> => {
  const invalid = validateEventAsset(kind, file)
  if (invalid) throw new EventAssetError(invalid)
  const path = `${companyId}/${eventId}/${kind}-${crypto.randomUUID()}.${EXT[file.type]}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export const eventAssetUrl = (path: string | null | undefined): string | null =>
  path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null
