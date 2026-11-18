// Formulario unico do editor (abas 1 e 2 nesta parte): schema, valores iniciais e o que vai para o banco.
// Campos de texto ficam como string ("" = nulo no banco); datas como "YYYY-MM-DDTHH:mm" no fuso do evento.

import { z } from 'zod'
import type { Event, EventFormField, EventFormat } from '@/types/events'
import type { DealPriority } from '@/types/database'
import { isValidSlug } from '@/lib/events/slug'
import { fromZonedInput, toZonedInput } from '@/lib/events/zoned-time'
import { hasOptions, MAX_OPTIONS, MIN_OPTIONS, type FieldDraft } from '@/lib/events/field-catalog'

const HTTP_RE = /^https?:\/\/\S+$/i
const optionalUrl = z.string().trim().refine((v) => v === '' || HTTP_RE.test(v), 'Use um link que comece com https://')

const optionSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1, 'Preencha a opção').max(120, 'Até 120 caracteres'),
  tag: z.string().trim().max(60).nullable(),
  priority: z.enum(['low', 'medium', 'high']).nullable(),
})

const fieldSchema = z.object({
  id: z.string(),
  kind: z.enum(['fixed', 'predefined', 'custom']),
  key: z.string().nullable(),
  type: z.string(),
  label: z.string().trim().min(1, 'Preencha o rótulo').max(120, 'Até 120 caracteres'),
  help_text: z.string().max(300, 'Até 300 caracteres'),
  placeholder: z.string().max(120, 'Até 120 caracteres'),
  required: z.boolean(),
  options: z.array(optionSchema).nullable(),
  terms_text: z.string(),
  destination: z.enum(['answer_only', 'contact_field', 'deal_field']),
  destination_field: z.string().nullable(),
}).superRefine((f, ctx) => {
  if (hasOptions(f.type as FieldDraft['type'])) {
    const n = f.options?.length ?? 0
    if (n < MIN_OPTIONS || n > MAX_OPTIONS) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: `De ${MIN_OPTIONS} a ${MAX_OPTIONS} opções` })
    }
  }
  if (f.type === 'terms' && f.terms_text.trim() === '') {
    ctx.addIssue({ code: 'custom', path: ['terms_text'], message: 'Escreva o texto do termo' })
  }
  if (f.destination === 'contact_field' && !f.destination_field) {
    ctx.addIssue({ code: 'custom', path: ['destination_field'], message: 'Escolha o campo do contato' })
  }
})

export const editorSchema = z.object({
  title: z.string().trim().min(3, 'Pelo menos 3 caracteres').max(120, 'Até 120 caracteres'),
  slug: z.string().refine(isValidSlug, 'Só letras minúsculas, números e hífens (3 a 80)'),
  category: z.string().max(60, 'Até 60 caracteres'),
  description: z.string().max(10000, 'Até 10.000 caracteres'),
  format: z.enum(['presencial', 'online', 'hibrido']),
  venue_name: z.string().max(120),
  cep: z.string().refine((v) => v === '' || /^\d{5}-?\d{3}$/.test(v), 'CEP com 8 dígitos'),
  street: z.string().max(160),
  number: z.string().max(20),
  complement: z.string().max(80),
  district: z.string().max(80),
  city: z.string().max(80),
  state: z.string().refine((v) => v === '' || /^[A-Za-z]{2}$/.test(v), 'UF com 2 letras'),
  online_url: optionalUrl,
  starts_at: z.string(),
  ends_at: z.string(),
  registration_opens_at: z.string(),
  registration_closes_at: z.string(),
  unlimited: z.boolean(),
  capacity: z.string(),
  show_remaining_spots: z.boolean(),
  organizer_name: z.string().max(120),
  organizer_description: z.string().max(500, 'Até 500 caracteres'),
  organizer_contact: z.string().max(160),
  privacy_policy_url: optionalUrl,
  confirmation_page_message: z.string().max(1000, 'Até 1.000 caracteres'),
  fields: z.array(fieldSchema),
}).superRefine((v, ctx) => {
  // Comparacao de "YYYY-MM-DDTHH:mm" no mesmo fuso funciona como texto.
  if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at) {
    ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'O fim tem de ser depois do início' })
  }
  if (v.registration_opens_at && v.registration_closes_at && v.registration_closes_at <= v.registration_opens_at) {
    ctx.addIssue({ code: 'custom', path: ['registration_closes_at'], message: 'Tem de ser depois da abertura' })
  }
  if (!v.unlimited && !/^[1-9]\d{0,5}$/.test(v.capacity)) {
    ctx.addIssue({ code: 'custom', path: ['capacity'], message: 'Informe um número de vagas maior que zero' })
  }
})

export type EditorValues = Omit<z.infer<typeof editorSchema>, 'format' | 'fields'> & {
  format: EventFormat
  fields: FieldDraft[]
}

const s = (v: string | null | undefined) => v ?? ''

export const fieldToDraft = (f: EventFormField): FieldDraft => ({
  id: f.id,
  kind: f.kind,
  key: f.key,
  type: f.type,
  label: f.label,
  help_text: s(f.help_text),
  placeholder: s(f.placeholder),
  required: f.required,
  // Opcao gravada sem tag/prioridade (chave ausente) vira null explicito.
  options: f.options?.map((o) => ({ id: o.id, label: o.label, tag: o.tag ?? null, priority: o.priority ?? null })) ?? null,
  terms_text: typeof f.config?.text === 'string' ? f.config.text : '',
  destination: f.destination,
  destination_field: f.destination === 'contact_field' ? (f.destination_field as FieldDraft['destination_field']) : null,
})

export const eventToValues = (e: Event, fields: EventFormField[]): EditorValues => ({
  title: e.title,
  slug: e.slug,
  category: s(e.category),
  description: s(e.description),
  format: e.format,
  venue_name: s(e.venue_name),
  cep: s(e.cep),
  street: s(e.street),
  number: s(e.number),
  complement: s(e.complement),
  district: s(e.district),
  city: s(e.city),
  state: s(e.state),
  online_url: s(e.online_url),
  starts_at: toZonedInput(e.starts_at, e.timezone),
  ends_at: toZonedInput(e.ends_at, e.timezone),
  registration_opens_at: toZonedInput(e.registration_opens_at, e.timezone),
  registration_closes_at: toZonedInput(e.registration_closes_at, e.timezone),
  unlimited: e.capacity === null,
  capacity: e.capacity === null ? '' : String(e.capacity),
  show_remaining_spots: e.show_remaining_spots,
  organizer_name: s(e.organizer_name),
  organizer_description: s(e.organizer_description),
  organizer_contact: s(e.organizer_contact),
  privacy_policy_url: s(e.privacy_policy_url),
  confirmation_page_message: s(e.confirmation_page_message),
  fields: [...fields].sort((a, b) => a.position - b.position).map(fieldToDraft),
})

const n = (v: string) => (v.trim() === '' ? null : v.trim())

export type EventPatch = Partial<Omit<Event, 'id' | 'company_id' | 'status' | 'closed_reason' | 'rr_cursor'
  | 'published_at' | 'finished_at' | 'canceled_at' | 'created_at' | 'updated_at'>>

/**
 * Colunas do evento a gravar. So as que o editor controla: estado e ciclo de vida
 * mudam pelas RPCs (o trigger events_guard_state_columns barra o resto).
 * A tag do evento acompanha o titulo enquanto ninguem a personalizou.
 */
export const valuesToEventPatch = (v: EditorValues, original: Event, autoTag: (title: string) => string): EventPatch => {
  const tz = original.timezone
  const format = v.format
  const inPerson = format !== 'online'
  const patch: EventPatch = {
    title: v.title.trim(),
    slug: v.slug,
    category: n(v.category),
    description: n(v.description),
    format,
    venue_name: inPerson ? n(v.venue_name) : null,
    cep: inPerson ? n(v.cep) : null,
    street: inPerson ? n(v.street) : null,
    number: inPerson ? n(v.number) : null,
    complement: inPerson ? n(v.complement) : null,
    district: inPerson ? n(v.district) : null,
    city: inPerson ? n(v.city) : null,
    state: inPerson ? (n(v.state)?.toUpperCase() ?? null) : null,
    online_url: format !== 'presencial' ? n(v.online_url) : null,
    starts_at: fromZonedInput(v.starts_at, tz),
    ends_at: fromZonedInput(v.ends_at, tz),
    registration_opens_at: fromZonedInput(v.registration_opens_at, tz),
    registration_closes_at: fromZonedInput(v.registration_closes_at, tz),
    capacity: v.unlimited ? null : Number(v.capacity),
    show_remaining_spots: v.unlimited ? false : v.show_remaining_spots,
    organizer_name: n(v.organizer_name),
    organizer_description: n(v.organizer_description),
    organizer_contact: n(v.organizer_contact),
    privacy_policy_url: n(v.privacy_policy_url),
    confirmation_page_message: n(v.confirmation_page_message),
  }
  if (original.event_tag_name === null || original.event_tag_name === autoTag(original.title)) {
    patch.event_tag_name = autoTag(patch.title ?? original.title)
  }
  return patch
}

export interface FieldRow {
  id: string
  company_id: string
  event_id: string
  position: number
  kind: FieldDraft['kind']
  key: FieldDraft['key']
  type: FieldDraft['type']
  label: string
  help_text: string | null
  placeholder: string | null
  required: boolean
  options: Array<{ id: string; label: string; tag: string | null; priority: DealPriority | null }> | null
  config: { text: string } | null
  destination: FieldDraft['destination']
  destination_field: string | null
}

export const draftsToRows = (fields: FieldDraft[], companyId: string, eventId: string): FieldRow[] =>
  fields.map((f, position) => ({
    id: f.id,
    company_id: companyId,
    event_id: eventId,
    position,
    kind: f.kind,
    key: f.key,
    type: f.type,
    label: f.label.trim(),
    help_text: n(f.help_text),
    placeholder: n(f.placeholder),
    required: f.type === 'terms' ? true : f.required,
    options: hasOptions(f.type)
      ? (f.options ?? []).map((o) => ({ ...o, label: o.label.trim(), tag: o.tag?.trim() || null }))
      : null,
    config: f.type === 'terms' ? { text: f.terms_text.trim() } : null,
    destination: f.destination,
    destination_field: f.destination === 'contact_field' ? f.destination_field : null,
  }))
