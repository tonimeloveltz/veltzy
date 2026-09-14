// signed_request da Meta (callbacks de desautorizacao e exclusao de dados).
// Formato: <assinatura base64url>.<payload base64url>. A assinatura e o
// HMAC-SHA256 do TRECHO payload ainda em base64url, com o app secret.
// Instagram DM, Onda 1. Nunca logar o signed_request.

import { base64UrlDecode, base64UrlEncode, hmacSha256, timingSafeEqual } from './instagram-hmac.ts'

export interface SignedRequestPayload {
  user_id: string
  [key: string]: unknown
}

export async function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): Promise<SignedRequestPayload | null> {
  if (!signedRequest || !appSecret) return null
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null
  const [signature, encodedPayload] = parts

  const expected = base64UrlEncode(await hmacSha256(appSecret, encodedPayload))
  if (!timingSafeEqual(signature.replace(/=+$/, ''), expected)) return null

  const bytes = base64UrlDecode(encodedPayload.replace(/=+$/, ''))
  if (!bytes) return null

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null

  const p = payload as Record<string, unknown>
  if (typeof p.algorithm !== 'string' || p.algorithm.toUpperCase() !== 'HMAC-SHA256') return null
  if (typeof p.user_id !== 'string' && typeof p.user_id !== 'number') return null

  return { ...p, user_id: String(p.user_id) }
}
