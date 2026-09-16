// State assinado do OAuth do Instagram, sem tabela (Instagram DM, Onda 1).
// Formato: base64url(json) + '.' + base64url(HMAC-SHA256(json)).
// Amarra o retorno do instagram.com ao usuario e a empresa que iniciaram o fluxo.

import { base64UrlDecode, base64UrlEncode, hmacSha256, timingSafeEqual } from './instagram-hmac.ts'

export interface StatePayload {
  companyId: string
  userId: string
  nonce: string
  /** Epoch em milissegundos. */
  exp: number
}

/** Validade do state: 10 minutos. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export async function signState(payload: StatePayload, secret: string): Promise<string> {
  if (!secret) throw new Error('INSTAGRAM_OAUTH_STATE_SECRET ausente')
  const json = JSON.stringify(payload)
  const body = base64UrlEncode(new TextEncoder().encode(json))
  const signature = base64UrlEncode(await hmacSha256(secret, json))
  return `${body}.${signature}`
}

const isStatePayload = (value: unknown): value is StatePayload => {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.companyId === 'string'
    && typeof p.userId === 'string'
    && typeof p.nonce === 'string'
    && typeof p.exp === 'number'
}

/** null se o formato, a assinatura ou a validade nao conferirem. */
export async function verifyState(state: string, secret: string, now: Date): Promise<StatePayload | null> {
  if (!state || !secret) return null
  const parts = state.split('.')
  if (parts.length !== 2) return null

  const bytes = base64UrlDecode(parts[0])
  if (!bytes) return null
  const json = new TextDecoder().decode(bytes)

  const expected = base64UrlEncode(await hmacSha256(secret, json))
  if (!timingSafeEqual(parts[1], expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!isStatePayload(parsed)) return null
  if (parsed.exp < now.getTime()) return null
  return parsed
}
