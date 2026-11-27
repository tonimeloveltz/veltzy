// Formulario unico do editor (abas 1 e 2 nesta parte): schema, valores iniciais e o que vai para o banco.
// Campos de texto ficam como string ("" = nulo no banco); datas como "YYYY-MM-DDTHH:mm" no fuso do evento.

import { z } from 'zod'
import type {
  Event, EventAppearance, EventAssignmentMode, EventFormField, EventFormat, EventMessagesConfig,
} from '@/types/events'
import type { DealPriority } from '@/types/database'
import { isValidSlug } from '@/lib/events/slug'
import { fromZonedInput, toZonedInput } from '@/lib/events/zoned-time'
import { hasOptions, MAX_OPTIONS, MIN_OPTIONS, type FieldDraft } from '@/lib/events/field-catalog'
import { isHexColor } from '@/lib/events/contrast'

const HTTP_RE = /^https?:\/\/\S+$/i
const optionalUrl = z.string().trim().refine((v) => v === '' || HTTP_RE.test(v), 'Use um link que comece com https://')

const hex = z.string().refine(isHexColor, 'Use uma cor no formato #RRGGBB')
const messageSchema = z.object({ enabled: z.boolean(), text: z.string().max(1000, 'Até 1.000 caracteres') })

export const MESSAGE_KINDS = ['confirmation', 'reminder_d1', 'post_present', 'post_absent', 'cancel_notice', 'date_change'] as const

/** Igual ao default do banco (migration 20261127094832): evento salvo antes dela nao tem a chave. */
export const DATE_CHANGE_DEFAULT = {
  enabled: true,
  text: 'Oi, {{primeiro_nome}}! O {{evento}} mudou de data.\n📅 Agora: {{data}} às {{hora}} (antes: {{data_anterior}} às {{hora_anterior}})\n📍 {{local}}\nDetalhes e agenda: {{link_inscricao}}',
}

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
  appearance: z.object({
    logo_path: z.string().nullable(),
    banner_path: z.string().nullable(),
    primary_color: hex,
    background_color: hex,
    button_text_color: hex,
    theme: z.enum(['light', 'dark']),
  }),
  pipeline_id: z.string(),
  entry_stage_id: z.string(),
  confirmed_stage_id: z.string(),
  present_stage_id: z.string(),
  absent_stage_id: z.string(),
  event_tag_name: z.string().max(120, 'Até 120 caracteres'),
  assignment_mode: z.enum(['fixed', 'round_robin']),
  fixed_assignee_id: z.string(),
  assignees: z.array(z.string()),
  whatsapp_session_name: z.string(),
  messages: z.object({
    confirmation: messageSchema, reminder_d1: messageSchema, post_present: messageSchema,
    post_absent: messageSchema, cancel_notice: messageSchema, date_change: messageSchema,
  }),
}).superRefine((v, ctx) => {
  for (const kind of MESSAGE_KINDS) {
    if (v.messages[kind].enabled && v.messages[kind].text.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['messages', kind, 'text'], message: 'Escreva a mensagem ou desligue o envio' })
    }
  }
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

export type EditorValues = Omit<z.infer<typeof editorSchema>, 'format' | 'fields' | 'appearance' | 'assignment_mode' | 'messages'> & {
  format: EventFormat
  fields: FieldDraft[]
  appearance: EventAppearance
  assignment_mode: EventAssignmentMode
  messages: EventMessagesConfig
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

export const eventToValues = (e: Event, fields: EventFormField[], assignees: string[] = []): EditorValues => ({
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
  appearance: { ...e.appearance },
  pipeline_id: s(e.pipeline_id),
  entry_stage_id: s(e.entry_stage_id),
  confirmed_stage_id: s(e.confirmed_stage_id),
  present_stage_id: s(e.present_stage_id),
  absent_stage_id: s(e.absent_stage_id),
  event_tag_name: s(e.event_tag_name),
  assignment_mode: e.assignment_mode,
  fixed_assignee_id: s(e.fixed_assignee_id),
  assignees,
  whatsapp_session_name: s(e.whatsapp_session_name),
  // date_change pode faltar em evento salvo antes da migration do aviso
  messages: Object.fromEntries(MESSAGE_KINDS.map((k) => [k, {
    ...((e.messages as Partial<EventMessagesConfig>)[k] ?? (k === 'date_change' ? DATE_CHANGE_DEFAULT : { enabled: false, text: '' })),
  }])) as EventMessagesConfig,
})

const n = (v: string) => (v.trim() === '' ? null : v.trim())

export type EventPatch = Partial<Omit<Event, 'id' | 'company_id' | 'status' | 'closed_reason' | 'rr_cursor'
  | 'published_at' | 'finished_at' | 'canceled_at' | 'created_at' | 'updated_at'>>

/**
 * Colunas do evento a gravar. So as que o editor controla: estado e ciclo de vida
 * mudam pelas RPCs (o trigger events_guard_state_columns barra o resto).
 * A tag do evento: a digitada na aba 4 vale; sem edicao, acompanha o titulo enquanto for a automatica.
 * Responsaveis do rodizio vao a parte (event_assignees).
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
    appearance: v.appearance,
    pipeline_id: n(v.pipeline_id),
    entry_stage_id: n(v.entry_stage_id),
    confirmed_stage_id: n(v.confirmed_stage_id),
    present_stage_id: n(v.present_stage_id),
    absent_stage_id: n(v.absent_stage_id),
    assignment_mode: v.assignment_mode,
    fixed_assignee_id: n(v.fixed_assignee_id),
    whatsapp_session_name: n(v.whatsapp_session_name),
    messages: v.messages,
  }
  if (v.event_tag_name.trim() !== (original.event_tag_name ?? '')) {
    patch.event_tag_name = n(v.event_tag_name)
  } else if (original.event_tag_name === null || original.event_tag_name === autoTag(original.title)) {
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
