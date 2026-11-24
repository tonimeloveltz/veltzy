// Pagina publica do evento: so pelas Edge Functions (event-public, event-register, event-registration),
// com a anon key. Nada de select direto (anon nao le tabela de evento) e nada que dependa de sessao.

import type { EventPublic, RegistrationPublic } from '@/types/events'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }

export class PublicNotFound extends Error {}

export const fetchPublicEvent = async (slug: string): Promise<EventPublic> => {
  const res = await fetch(`${BASE}/event-public?slug=${encodeURIComponent(slug)}`, { headers })
  if (res.status === 404) throw new PublicNotFound()
  if (!res.ok) throw new Error(`event-public ${res.status}`)
  return res.json() as Promise<EventPublic>
}

export interface RegisterPayload {
  slug: string
  rendered_at: number
  website: string
  idempotency_key: string
  first_name: string
  last_name: string | null
  email: string | null
  whatsapp: string
  answers: Array<{ field_id: string; value: unknown }>
  consent_privacy: boolean
  consent_marketing: boolean
  ref: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
}

export type RegisterResult =
  | { result: 'ok'; token: string }
  | { result: 'validation'; errors: Record<string, string> }
  | { result: 'duplicate' | 'sold_out' | 'closed' | 'not_open' | 'finished' | 'canceled' | 'rate_limited' | 'rejected' | 'not_found' | 'error' }

/** Os codigos de erro voltam como resultado (422, 429, 400), nao como excecao. */
export const submitRegistration = async (payload: RegisterPayload): Promise<RegisterResult> => {
  const res = await fetch(`${BASE}/event-register`, { method: 'POST', headers, body: JSON.stringify(payload) })
  const body = await res.json().catch(() => null) as { result?: string } | null
  if (body && typeof body.result === 'string') return body as RegisterResult
  return { result: 'error' }
}

export const fetchRegistration = async (token: string): Promise<RegistrationPublic> => {
  const res = await fetch(`${BASE}/event-registration?token=${encodeURIComponent(token)}`, { headers })
  if (res.status === 404) throw new PublicNotFound()
  if (!res.ok) throw new Error(`event-registration ${res.status}`)
  return res.json() as Promise<RegistrationPublic>
}

export type RegistrationActionResult = 'ok' | 'already' | 'invalid_state' | 'not_found' | 'invalid' | 'error'

export const registrationAction = async (token: string, action: 'confirm' | 'cancel'): Promise<RegistrationActionResult> => {
  const res = await fetch(`${BASE}/event-registration`, { method: 'POST', headers, body: JSON.stringify({ token, action }) })
  const body = await res.json().catch(() => null) as { result?: RegistrationActionResult } | null
  return body?.result ?? 'error'
}
