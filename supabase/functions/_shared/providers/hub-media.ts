import type { SendMessagePayload } from '../whatsapp-provider.ts'

/**
 * Corpo de midia para waha-send-message / evolution-send-message do Hub.
 * Documento leva nome original e mimetype: sem eles o celular recebe arquivo
 * generico e nao abre (Hub specs/envio-documento-mimetype).
 * Legenda igual ao nome do arquivo e omitida: o inbox manda content = nome do arquivo.
 */
export function buildHubMedia(payload: SendMessagePayload): Record<string, unknown> {
  const caption = payload.content && payload.content !== payload.fileName ? payload.content : undefined
  return {
    type: payload.type,
    url: payload.mediaUrl,
    ...(caption ? { caption } : {}),
    ...(payload.fileName ? { file_name: payload.fileName } : {}),
    ...(payload.mimeType ? { mimetype: payload.mimeType } : {}),
  }
}
