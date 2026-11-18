import { describe, expect, it } from 'vitest'
import type { Event, EventFormField } from '@/types/events'
import { draftsToRows, editorSchema, eventToValues, valuesToEventPatch } from './editor-form'
import { newFieldDraft, PREDEFINED_FIELDS, CUSTOM_FIELDS } from './field-catalog'

const autoTag = (t: string) => `Evento: ${t}`

const event = {
  id: 'ev', company_id: 'co', slug: 'workshop', title: 'Workshop', description: null, category: null,
  format: 'presencial', venue_name: 'Auditório', cep: null, street: null, number: null, complement: null,
  district: null, city: 'São Paulo', state: 'SP', online_url: null,
  starts_at: '2026-11-24T12:00:00.000Z', ends_at: '2026-11-24T15:00:00.000Z', timezone: 'America/Sao_Paulo',
  registration_opens_at: null, registration_closes_at: null, capacity: null, show_remaining_spots: false,
  status: 'draft', closed_reason: null, organizer_name: null, organizer_description: null, organizer_contact: null,
  privacy_policy_url: null, pipeline_id: null, entry_stage_id: null, confirmed_stage_id: null,
  present_stage_id: null, absent_stage_id: null, assignment_mode: 'fixed', fixed_assignee_id: null, rr_cursor: 0,
  event_tag_name: 'Evento: Workshop', whatsapp_session_name: null, show_powered_by: true,
  appearance: { logo_path: null, banner_path: null, primary_color: '#0E7490', background_color: '#F8FAFC', button_text_color: '#FFFFFF', theme: 'light' },
  messages: {
    confirmation: { enabled: true, text: 'Oi {{primeiro_nome}}' }, reminder_d1: { enabled: true, text: 'Amanhã' },
    post_present: { enabled: true, text: 'Obrigado' }, post_absent: { enabled: true, text: 'Sentimos' },
    cancel_notice: { enabled: false, text: '' },
  },
  confirmation_page_message: null, price_cents: 0, currency: 'BRL', is_paid: false, created_by: null,
  published_at: null, finished_at: null, canceled_at: null, deleted_at: null, created_at: '', updated_at: '',
} as unknown as Event

const fixed = (key: 'first_name' | 'email', position: number): EventFormField => ({
  id: key, company_id: 'co', event_id: 'ev', position, kind: 'fixed', key, type: key === 'email' ? 'email' : 'text',
  label: key, help_text: null, placeholder: null, required: true, options: null, config: null,
  destination: 'answer_only', destination_field: null, deleted_at: null, created_at: '', updated_at: '',
})

describe('eventToValues', () => {
  it('converte datas para o fuso do evento e ordena os campos', () => {
    const v = eventToValues(event, [fixed('email', 2), fixed('first_name', 0)])
    expect(v.starts_at).toBe('2026-11-24T09:00')
    expect(v.unlimited).toBe(true)
    expect(v.fields.map((f) => f.key)).toEqual(['first_name', 'email'])
  })
})

describe('fieldToDraft', () => {
  it('opcao sem tag e prioridade vira null e passa no schema', () => {
    const radio = { ...fixed('email', 4), kind: 'custom', key: null, type: 'radio', required: false,
      options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', tag: 'x', priority: 'high' }] } as unknown as EventFormField
    const v = eventToValues(event, [radio])
    expect(v.fields[0].options?.[0]).toEqual({ id: 'a', label: 'A', tag: null, priority: null })
    expect(editorSchema.safeParse(v).success).toBe(true)
  })
})

describe('valuesToEventPatch', () => {
  const base = eventToValues(event, [])

  it('a tag automatica acompanha o titulo', () => {
    expect(valuesToEventPatch({ ...base, title: 'Imersão' }, event, autoTag).event_tag_name).toBe('Evento: Imersão')
  })

  it('tag digitada na aba 4 vale, mesmo com o titulo mudando', () => {
    expect(valuesToEventPatch({ ...base, title: 'Imersão', event_tag_name: 'vip' }, event, autoTag).event_tag_name).toBe('vip')
  })

  it('pipeline vazio vira null e mensagens vao inteiras', () => {
    const p = valuesToEventPatch({ ...base, pipeline_id: '', entry_stage_id: '' }, event, autoTag)
    expect(p.pipeline_id).toBeNull()
    expect(p.messages?.cancel_notice.enabled).toBe(false)
  })

  it('tag personalizada nao muda', () => {
    const custom = { ...event, event_tag_name: 'vip' } as Event
    expect(valuesToEventPatch({ ...eventToValues(custom, []), title: 'Imersão' }, custom, autoTag).event_tag_name).toBeUndefined()
  })

  it('online limpa o endereco e presencial limpa o link', () => {
    const online = valuesToEventPatch({ ...base, format: 'online', online_url: 'https://meet' }, event, autoTag)
    expect(online.venue_name).toBeNull()
    expect(online.city).toBeNull()
    expect(online.online_url).toBe('https://meet')
    const presencial = valuesToEventPatch({ ...base, online_url: 'https://meet' }, event, autoTag)
    expect(presencial.online_url).toBeNull()
  })

  it('volta as datas para UTC e trata vagas', () => {
    const p = valuesToEventPatch({ ...base, unlimited: false, capacity: '50', show_remaining_spots: true }, event, autoTag)
    expect(p.starts_at).toBe('2026-11-24T12:00:00.000Z')
    expect(p.capacity).toBe(50)
    expect(p.show_remaining_spots).toBe(true)
    expect(valuesToEventPatch({ ...base, show_remaining_spots: true }, event, autoTag).show_remaining_spots).toBe(false)
  })
})

describe('editorSchema', () => {
  const base = eventToValues(event, [])

  it('recusa fim antes do inicio e vagas invalidas', () => {
    const r = editorSchema.safeParse({ ...base, ends_at: '2026-11-24T08:00', unlimited: false, capacity: '0' })
    expect(r.success).toBe(false)
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['ends_at', 'capacity']))
  })

  it('mensagem ligada sem texto e cor invalida sao recusadas', () => {
    const r = editorSchema.safeParse({
      ...base,
      messages: { ...base.messages, reminder_d1: { enabled: true, text: ' ' } },
      appearance: { ...base.appearance, primary_color: 'azul' },
    })
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['messages.reminder_d1.text', 'appearance.primary_color']))
  })

  it('termo exige texto e lista exige 2 opcoes', () => {
    const terms = newFieldDraft(PREDEFINED_FIELDS.find((f) => f.key === 'terms')!)
    const list = { ...newFieldDraft(CUSTOM_FIELDS[0]), options: [] }
    const r = editorSchema.safeParse({ ...base, fields: [terms, list] })
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['fields.0.terms_text', 'fields.1.options']))
  })
})

describe('draftsToRows', () => {
  it('posicao pela ordem, termo sempre obrigatorio e config com o texto', () => {
    const terms = { ...newFieldDraft(PREDEFINED_FIELDS.find((f) => f.key === 'terms')!), required: false, terms_text: ' Aceito ' }
    const company = newFieldDraft(PREDEFINED_FIELDS[0])
    const rows = draftsToRows([company, terms], 'co', 'ev')
    expect(rows.map((r) => r.position)).toEqual([0, 1])
    expect(rows[0]).toMatchObject({ destination: 'contact_field', destination_field: 'company_name', config: null })
    expect(rows[1]).toMatchObject({ required: true, config: { text: 'Aceito' }, options: null })
  })
})
