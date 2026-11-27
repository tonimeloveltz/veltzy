import { supabase, veltzy } from '@/lib/supabase'
import { REGISTRATION_COLUMNS, type RegistrationRow } from '@/lib/events/registration-view'
import type { RegistrationStatus } from '@/types/events'

// Toda query filtra por company_id. Lista paginada com range + count exact (max_rows corta em 1000 sem erro).

export const PAGE_SIZE = 50
const SELECT = `${REGISTRATION_COLUMNS}, deal:deals(priority)`

export type StatusFilter = 'active' | 'all' | RegistrationStatus
/** 'all' | 'direct' | 'ref:<code>' | 'utm:<source>' */
export type OriginFilter = string

export interface RegistrationFilters {
  search: string
  status: StatusFilter
  origin: OriginFilter
  page: number
}

// Virgula e parenteses quebram o filtro or() do PostgREST.
const clean = (s: string) => s.replace(/[,()*%\\]/g, ' ').trim()

export const listRegistrations = async (
  companyId: string, eventId: string, f: RegistrationFilters,
): Promise<{ rows: RegistrationRow[]; total: number }> => {
  let q = veltzy()
    .from('event_registrations')
    .select(SELECT, { count: 'exact' })
    .eq('company_id', companyId)
    .eq('event_id', eventId)
  if (f.status === 'active') q = q.neq('status', 'canceled')
  else if (f.status !== 'all') q = q.eq('status', f.status)
  if (f.origin === 'direct') q = q.is('ref_code', null).is('utm_source', null)
  else if (f.origin.startsWith('ref:')) q = q.eq('ref_code', f.origin.slice(4))
  else if (f.origin.startsWith('utm:')) q = q.is('ref_code', null).eq('utm_source', f.origin.slice(4))
  const text = clean(f.search)
  if (text) {
    const digits = text.replace(/\D/g, '')
    const ors = [`first_name.ilike.*${text}*`, `last_name.ilike.*${text}*`, `email.ilike.*${text}*`]
    if (digits.length >= 3) ors.push(`whatsapp.ilike.*${digits}*`)
    q = q.or(ors.join(','))
  }
  const from = f.page * PAGE_SIZE
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as RegistrationRow[], total: count ?? 0 }
}

/** Todas as inscricoes do evento, em paginas de 1000 (painel, CSV e check-in). */
/** Inscricoes ativas (inscrito ou confirmado): quem recebe o aviso de data alterada. */
export const countActiveRegistrations = async (companyId: string, eventId: string): Promise<number> => {
  const { count, error } = await veltzy()
    .from('event_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('event_id', eventId)
    .in('status', ['registered', 'confirmed'])
  if (error) throw error
  return count ?? 0
}

export const listAllRegistrations = async (companyId: string, eventId: string): Promise<RegistrationRow[]> => {
  const all: RegistrationRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await veltzy()
      .from('event_registrations')
      .select(SELECT)
      .eq('company_id', companyId)
      .eq('event_id', eventId)
      .order('created_at')
      .range(from, from + 999)
    if (error) throw error
    all.push(...((data ?? []) as unknown as RegistrationRow[]))
    if (!data || data.length < 1000) return all
  }
}

export type RegistrationActionResult = {
  result: 'ok' | 'already' | 'not_found' | 'invalid_state' | 'forbidden' | 'rate_limited' | 'invalid_action'
  checked_in_at?: string
  status?: RegistrationStatus
}

const rpc = async (fn: string, args: Record<string, unknown>): Promise<RegistrationActionResult> => {
  const { data, error } = await veltzy().rpc(fn, args)
  if (error) throw error
  return data as RegistrationActionResult
}

export const checkIn = (id: string) => rpc('check_in', { p_registration_id: id })
export const undoCheckIn = (id: string) => rpc('undo_check_in', { p_registration_id: id })
export const adminSetRegistrationStatus = (id: string, action: 'confirm' | 'cancel') =>
  rpc('admin_set_registration_status', { p_registration_id: id, p_action: action })
export const adminResendConfirmation = (id: string) => rpc('admin_resend_confirmation', { p_registration_id: id })

export interface ManualRegistrationInput {
  event_id: string
  first_name: string
  last_name: string
  email: string
  whatsapp: string
  answers: Array<{ field_id: string; value: unknown }>
}

export type ManualRegistrationResult =
  | { result: 'ok'; registration_id: string }
  | { result: 'validation'; errors: Record<string, string> }
  | { result: string; registration_id?: string }

/** Inscricao manual pela Edge Function (mesmas regras da pagina publica, sem os aceites). */
export const registerManually = async (input: ManualRegistrationInput): Promise<ManualRegistrationResult> => {
  const { data, error } = await supabase.functions.invoke('event-admin-register', { body: input })
  if (error) {
    // 422 de validacao chega como erro; o corpo traz os campos.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null)
      if (body && typeof body === 'object' && 'result' in body) return body as ManualRegistrationResult
    }
    throw error
  }
  return data as ManualRegistrationResult
}

export interface DealRegistration extends RegistrationRow {
  event: { id: string; title: string; slug: string; timezone: string } | null
}

/** Inscricao que gerou o negocio (bloco "Evento" na tela do negocio). null quando o negocio nao veio de evento. */
export const getRegistrationByDeal = async (companyId: string, dealId: string): Promise<DealRegistration | null> => {
  const { data, error } = await veltzy()
    .from('event_registrations')
    .select(`${REGISTRATION_COLUMNS}, event_id`)
    .eq('company_id', companyId)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as RegistrationRow & { event_id: string }
  const { data: ev, error: evError } = await veltzy()
    .from('events')
    .select('id, title, slug, timezone')
    .eq('company_id', companyId)
    .eq('id', row.event_id)
    .maybeSingle()
  if (evError) throw evError
  return { ...row, event: (ev as DealRegistration['event']) ?? null }
}
