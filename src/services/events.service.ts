import { veltzy } from '@/lib/supabase'
import { draftSlug } from '@/lib/events/slug'
import type { EventListItem } from '@/lib/events/event-list'
import type { Event, EventFormField } from '@/types/events'

// Toda query filtra por company_id; a RLS e a ultima linha de defesa, nao a unica.

const LIST_COLUMNS =
  'id, slug, title, status, closed_reason, format, starts_at, ends_at, timezone, city, state, capacity, updated_at'

export const getEvents = async (companyId: string): Promise<EventListItem[]> => {
  const { data, error } = await veltzy()
    .from('events')
    .select(LIST_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as EventListItem[]
}

export const getEventById = async (companyId: string, id: string): Promise<Event | null> => {
  const { data, error } = await veltzy()
    .from('events')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return (data as Event | null) ?? null
}

export interface EventCounts {
  registered: number
  confirmed: number
  attended: number
}

const ACTIVE_STATUSES = ['registered', 'confirmed', 'attended', 'absent']

/**
 * Contadores da lista. count exact com head:true (imune ao max_rows de 1000).
 * Confirmados = quem confirmou e nao cancelou, inclusive quem depois fez check-in.
 */
export const getEventCounts = async (companyId: string, eventIds: string[]): Promise<Record<string, EventCounts>> => {
  const base = (eventId: string) =>
    veltzy()
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('event_id', eventId)
  type Query = ReturnType<typeof base>
  const count = async (eventId: string, apply: (q: Query) => Query) => {
    const { count: n, error } = await apply(base(eventId))
    if (error) throw error
    return n ?? 0
  }

  const entries = await Promise.all(
    eventIds.map(async (id) => {
      const [registered, confirmed, attended] = await Promise.all([
        count(id, (q) => q.in('status', ACTIVE_STATUSES)),
        count(id, (q) => q.in('status', ACTIVE_STATUSES).not('confirmed_at', 'is', null)),
        count(id, (q) => q.eq('status', 'attended')),
      ])
      return [id, { registered, confirmed, attended }] as const
    }),
  )
  return Object.fromEntries(entries)
}

/** Campos fixos de todo evento novo (PRD 9.2: Sobrenome opcional por padrao, E-mail obrigatorio por padrao). */
const FIXED_FIELDS: Array<Pick<EventFormField, 'position' | 'key' | 'type' | 'label' | 'required'>> = [
  { position: 0, key: 'first_name', type: 'text', label: 'Nome', required: true },
  { position: 1, key: 'last_name', type: 'text', label: 'Sobrenome', required: false },
  { position: 2, key: 'email', type: 'email', label: 'E-mail', required: true },
  { position: 3, key: 'whatsapp', type: 'phone', label: 'WhatsApp', required: true },
]

export const DEFAULT_EVENT_TITLE = 'Novo evento'
export const eventTagName = (title: string) => `Evento: ${title}`.slice(0, 120)

/** Cria o rascunho com os campos fixos. Falhou nos campos, o rascunho e descartado (soft delete). */
export const createDraftEvent = async (companyId: string, profileId: string): Promise<string> => {
  const { data, error } = await veltzy()
    .from('events')
    .insert({
      company_id: companyId,
      title: DEFAULT_EVENT_TITLE,
      slug: draftSlug(DEFAULT_EVENT_TITLE),
      event_tag_name: eventTagName(DEFAULT_EVENT_TITLE),
      created_by: profileId,
    })
    .select('id')
    .single()
  if (error) throw error
  const eventId = (data as { id: string }).id

  const { error: fieldsError } = await veltzy()
    .from('event_form_fields')
    .insert(FIXED_FIELDS.map((f) => ({ ...f, company_id: companyId, event_id: eventId, kind: 'fixed' })))
  if (fieldsError) {
    await veltzy().from('events').update({ deleted_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('id', eventId)
    throw fieldsError
  }
  return eventId
}

export const softDeleteEvent = async (companyId: string, id: string): Promise<void> => {
  const { error } = await veltzy()
    .from('events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
  if (error) throw error
}

// ---- RPCs de ciclo de vida (validam empresa e papel no banco) ----

export type LifecycleResult =
  | { result: 'ok'; event_id?: string; pipeline_id?: string }
  | { result: 'missing'; missing: string[] }
  | { result: 'forbidden' | 'invalid_state' }

const rpc = async (fn: string, args: Record<string, unknown>): Promise<LifecycleResult> => {
  const { data, error } = await veltzy().rpc(fn, args)
  if (error) throw error
  return data as LifecycleResult
}

export const publishEvent = (id: string) => rpc('publish_event', { p_event_id: id })
export const unpublishEvent = (id: string) => rpc('unpublish_event', { p_event_id: id })
export const cancelEvent = (id: string) => rpc('cancel_event', { p_event_id: id })
export const duplicateEvent = (id: string) => rpc('duplicate_event', { p_event_id: id })
export const createEventPipeline = (id: string) => rpc('create_event_pipeline', { p_event_id: id })

export const isEventSlugAvailable = async (slug: string, eventId?: string): Promise<boolean> => {
  const { data, error } = await veltzy().rpc('event_slug_available', { p_slug: slug, p_event_id: eventId ?? null })
  if (error) throw error
  return data === true
}

export const getEventPublishMissing = async (id: string): Promise<string[]> => {
  const { data, error } = await veltzy().rpc('event_publish_missing', { p_event_id: id })
  if (error) throw error
  return (data as string[] | null) ?? []
}

/** Mensagem para o toast quando a RPC nao devolve ok. */
export const lifecycleErrorMessage = (r: LifecycleResult): string => {
  switch (r.result) {
    case 'forbidden': return 'Você não tem permissão para esta ação.'
    case 'invalid_state': return 'O evento mudou de estado. Atualize a página.'
    case 'missing': return 'Faltam itens obrigatórios para publicar.'
    default: return 'Não foi possível concluir a ação.'
  }
}
