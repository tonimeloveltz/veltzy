// Linha de inscrito como as telas usam (aba 6, painel, CSV, check-in).

import type { EventRegistration, RegistrationStatus } from '@/types/events'
import type { DealPriority } from '@/types/database'

export const REGISTRATION_COLUMNS =
  'id, lead_id, deal_id, status, first_name, last_name, email, whatsapp, answers, ref_code, utm_source, utm_medium, ' +
  'utm_campaign, utm_content, utm_term, consent_marketing, source, confirmed_at, checked_in_at, canceled_at, created_at'

export type RegistrationRow = Pick<EventRegistration, 'id' | 'lead_id' | 'deal_id' | 'status' | 'first_name' | 'last_name'
  | 'email' | 'whatsapp' | 'answers' | 'ref_code' | 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content'
  | 'utm_term' | 'consent_marketing' | 'source' | 'confirmed_at' | 'checked_in_at' | 'canceled_at' | 'created_at'> & {
  deal?: { priority: DealPriority | null } | null
}

export const STATUS_LABEL: Record<RegistrationStatus, string> = {
  registered: 'Inscrito', confirmed: 'Confirmado', attended: 'Presente', absent: 'Ausente', canceled: 'Cancelado',
}

export const fullName = (r: Pick<RegistrationRow, 'first_name' | 'last_name'>) =>
  [r.first_name, r.last_name].filter(Boolean).join(' ')

/** Origem: codigo do divulgador, senao utm_source, senao "direto". */
export const registrationOrigin = (r: Pick<RegistrationRow, 'ref_code' | 'utm_source'>): string =>
  r.ref_code ? `ref: ${r.ref_code}` : r.utm_source ? `utm: ${r.utm_source}` : 'direto'

/** Resposta do pre-definido Empresa (pelo id do campo), como exibida. */
export const answerDisplay = (r: Pick<RegistrationRow, 'answers'>, fieldId: string | null): string =>
  fieldId ? (r.answers.find((a) => a.field_id === fieldId)?.display ?? '') : ''

/** "08:52" no fuso do evento. */
export const timeInZone = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

/** Check-in so ate 48 h depois do fim (mesma janela do banco). */
export const checkInOpen = (endsAt: string | null, now = new Date()) =>
  !endsAt || now.getTime() <= Date.parse(endsAt) + 48 * 3600 * 1000

export const isActive = (s: RegistrationStatus) => s !== 'canceled'
