// Nucleo da inscricao, compartilhado por event-register (publico) e event-admin-register.
// Valida o envelope, os campos fixos e as respostas, e chama register_for_event.

import { z } from 'https://esm.sh/zod@3.23.8'
import type { PublicClient, VeltzyClient } from './clients.ts'
import { isValidPhoneBR, normalizePhoneBR } from '../phone.ts'
import { isMobilePhoneBR } from './mobile-phone.ts'
import { isValidEmail, validateAnswers, type ValidatableField } from './form-validate.ts'

export const TERMS_VERSION = 'eventos-v1'
export const PRIVACY_TEXT = 'Li e aceito a Política de Privacidade'
export const marketingText = (organizer: string) =>
  `Quero receber comunicações de ${organizer} sobre próximos eventos e conteúdos.`

const optStr = (max: number) => z.string().max(max).optional().nullable()

export const registerEnvelope = z.object({
  first_name: z.string().max(120),
  last_name: optStr(120),
  email: optStr(254),
  whatsapp: z.string().max(40),
  answers: z.array(z.object({ field_id: z.string().uuid(), value: z.unknown() })).max(60).default([]),
  ref: optStr(80),
  utm_source: optStr(200),
  utm_medium: optStr(200),
  utm_campaign: optStr(200),
  utm_content: optStr(200),
  utm_term: optStr(200),
  referrer: optStr(500),
  consent_privacy: z.boolean().optional().default(false),
  consent_marketing: z.boolean().optional().default(false),
  idempotency_key: z.string().min(16).max(64).optional().nullable(),
})

export type RegisterEnvelope = z.infer<typeof registerEnvelope>

/** ref de divulgador: minusculas, so a-z0-9-, ate 40. Vazio vira null. */
export function normalizeRef(ref: string | null | undefined): string | null {
  if (!ref) return null
  const clean = ref.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return clean || null
}

export interface LoadedEvent {
  id: string
  company_id: string
  status: string
  organizer: string
  fields: Array<ValidatableField & { key: string | null }>
}

/** Evento pelo slug (publico) ou pelo id (admin). null = inexistente, rascunho ou excluido. */
export async function loadEventForRegistration(
  veltzy: VeltzyClient,
  pub: PublicClient,
  by: { slug: string } | { id: string },
): Promise<LoadedEvent | null> {
  let q = veltzy.from('events').select('id, company_id, status, organizer_name').is('deleted_at', null)
  q = 'slug' in by ? q.eq('slug', by.slug) : q.eq('id', by.id)
  const { data: ev } = await q.maybeSingle()
  if (!ev || ev.status === 'draft') return null
  const { data: fields } = await veltzy
    .from('event_form_fields')
    .select('id, kind, key, type, required, options')
    .eq('event_id', ev.id)
    .is('deleted_at', null)
  let organizer = (ev.organizer_name as string | null) ?? ''
  if (!organizer) {
    const { data: company } = await pub.from('companies').select('name').eq('id', ev.company_id).maybeSingle()
    organizer = (company?.name as string | undefined) ?? 'o organizador'
  }
  return { id: ev.id, company_id: ev.company_id, status: ev.status, organizer, fields: (fields ?? []) as LoadedEvent['fields'] }
}

export type PrepareResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> }

/** Campos fixos + respostas. Devolve o p_payload pronto ou os erros (422). */
export function prepareRegistration(
  ev: LoadedEvent,
  input: RegisterEnvelope,
  extra: Record<string, unknown>,
): PrepareResult {
  const errors: Record<string, string> = {}
  const fixed = (key: string) => ev.fields.find((f) => f.kind === 'fixed' && f.key === key)

  const firstName = input.first_name.trim()
  if (!firstName) errors.first_name = 'required'

  const lastName = (input.last_name ?? '').trim()
  if (!lastName && fixed('last_name')?.required) errors.last_name = 'required'

  const email = (input.email ?? '').trim().toLowerCase()
  if (!email) {
    if (fixed('email')?.required) errors.email = 'required'
  } else if (!isValidEmail(email)) {
    errors.email = 'invalid_email'
  }

  const whatsapp = normalizePhoneBR(input.whatsapp)
  // So celular (Toni, 18/11): fixo valido vira not_mobile, para o formulario explicar.
  if (!isMobilePhoneBR(whatsapp)) errors.whatsapp = isValidPhoneBR(whatsapp) ? 'not_mobile' : 'invalid_phone'

  Object.assign(errors, validateAnswers(ev.fields, input.answers))
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    payload: {
      event_id: ev.id,
      first_name: firstName,
      last_name: lastName || null,
      email: email || null,
      whatsapp,
      answers: input.answers,
      ref_code: normalizeRef(input.ref),
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_content: input.utm_content ?? null,
      utm_term: input.utm_term ?? null,
      referrer_url: input.referrer ?? null,
      consent_privacy: input.consent_privacy,
      consent_marketing: input.consent_marketing,
      privacy_text: PRIVACY_TEXT,
      marketing_text: marketingText(ev.organizer),
      terms_version: TERMS_VERSION,
      idempotency_key: input.idempotency_key ?? null,
      ...extra,
    },
  }
}

/** Mensagem de confirmacao pendente da inscricao (para disparar sem esperar o cron). */
export async function pendingConfirmationId(veltzy: VeltzyClient, registrationId: string): Promise<string | null> {
  const { data } = await veltzy
    .from('event_messages').select('id')
    .eq('registration_id', registrationId).eq('kind', 'confirmation').eq('status', 'pending')
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Chama o event-dispatcher para uma mensagem, sem bloquear a resposta. */
export function kickDispatcher(messageId: string): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return fetch(`${url}/functions/v1/event-dispatcher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ message_id: messageId }),
  }).then((r) => { r.body?.cancel() }).catch((err) => console.error('[events] kickDispatcher', err))
}

/** waitUntil quando existe (Edge Runtime); senao, so dispara. */
export function runInBackground(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
}

export function json(body: unknown, cors: Record<string, string>, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } })
}
