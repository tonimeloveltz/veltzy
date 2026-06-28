import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Download e persistencia de midia da Meta Cloud API.
 *
 * A Cloud API entrega media_id, nao URL. O fluxo exige 2 GETs autenticados:
 *   1. GET graph/{media_id}  -> retorna uma url temporaria
 *   2. GET <url> (com token) -> bytes da midia
 * O media_id/URL expira rapido e exige token, entao baixamos e PERSISTIMOS no
 * Storage aqui, passando a URL publica ao handler. O lead-inbound-handler detecta
 * URLs em /storage/v1/object/public/chat-attachments/ e nao re-baixa.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * Baixa a midia e persiste em chat-attachments. Retorna a URL publica do Storage
 * e o mime real, ou null em qualquer falha (best-effort: midia perdida nunca
 * derruba a mensagem).
 */
export async function downloadAndPersistCloudApiMedia(
  supabaseUrl: string,
  supabaseKey: string,
  companyId: string,
  mediaId: string,
  token: string,
  fallbackMime: string | null,
): Promise<{ fileUrl: string; mimeType: string } | null> {
  try {
    // 1. Resolver URL temporaria
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!metaRes.ok) {
      console.error(`[cloud-api-media] meta lookup failed (${metaRes.status}) for ${mediaId}`)
      return null
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string }
    if (!meta.url) return null

    // 2. Baixar bytes (URL exige o mesmo Bearer token)
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
    if (!binRes.ok) {
      console.error(`[cloud-api-media] download failed (${binRes.status}) for ${mediaId}`)
      return null
    }
    const buffer = await binRes.arrayBuffer()
    if (buffer.byteLength === 0) return null

    const mime = meta.mime_type ?? fallbackMime ?? binRes.headers.get('content-type') ?? 'application/octet-stream'
    const ext = extensionFromMime(mime)
    const path = `${companyId}/cloud-api/${mediaId}.${ext}`

    // 3. Upload para o bucket proprio
    const storage = createClient(supabaseUrl, supabaseKey)
    const { error } = await storage.storage
      .from('chat-attachments')
      .upload(path, buffer, { contentType: mime, upsert: true })
    if (error) {
      console.error('[cloud-api-media] upload error:', JSON.stringify(error))
      return null
    }

    const { data } = storage.storage.from('chat-attachments').getPublicUrl(path)
    return { fileUrl: data.publicUrl, mimeType: mime }
  } catch (err) {
    console.error('[cloud-api-media] failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/amr': 'amr',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
  }
  const base = mime.split(';')[0].trim()
  return map[base] ?? base.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? 'bin'
}
