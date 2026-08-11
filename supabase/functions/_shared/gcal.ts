/**
 * Google Calendar: costura unica entre a Veltzy e a API do Google.
 *
 * Todo acesso ao Google passa por aqui. Se um dia o OAuth migrar para o Hub,
 * troca-se o corpo deste arquivo e nada mais precisa mudar.
 *
 * REGRA CRITICA: sendUpdates=all em create/patch/delete. E esse parametro, e
 * so ele, que faz o Google enviar o email de convite ao cliente. Sem ele o
 * evento nasce mudo e ninguem percebe.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars'
const MEETING_TIME_ZONE = 'America/Sao_Paulo'
const DEFAULT_DURATION_MIN = 60

/** Margem de seguranca: renova o token se ele vence em menos de 60 segundos. */
const EXPIRY_SKEW_MS = 60 * 1000

/** O vendedor nunca conectou a conta Google. */
export class GcalNotConnectedError extends Error {
  constructor(message = 'Vendedor sem Google Agenda conectado') {
    super(message)
    this.name = 'GcalNotConnectedError'
  }
}

/** A conexao existe mas morreu: token revogado no Google, ou refresh recusado. */
export class GcalAuthError extends Error {
  constructor(message = 'Conexao com o Google expirou, e preciso reconectar') {
    super(message)
    this.name = 'GcalAuthError'
  }
}

/** O Google recusou a chamada (email invalido, quota, etc.). */
export class GcalProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GcalProviderError'
  }
}

export interface GcalEventAttendee {
  email: string
  displayName?: string
}

export interface GcalEvent {
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  attendees?: GcalEventAttendee[]
}

/** Subconjunto de veltzy.tasks que interessa ao calendario. */
export interface GcalTaskInput {
  title: string
  description?: string | null
  meeting_date: string
  meeting_duration?: number | null
  meeting_link?: string | null
  meeting_lead_email?: string | null
}

interface ConnectionRow {
  id: string
  calendar_id: string
  access_token: string
  refresh_token: string
  token_expires_at: string
  is_active: boolean
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

const CONNECTIONS_TABLE = 'google_calendar_connections'

/**
 * Devolve um access_token valido para o profile, renovando se necessario.
 *
 * @param supabase client com service role no schema public
 * @throws GcalNotConnectedError quando o vendedor nunca conectou
 * @throws GcalAuthError quando a conexao existe mas nao autentica mais
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ accessToken: string; calendarId: string }> {
  const { data, error } = await supabase
    .from(CONNECTIONS_TABLE)
    .select('id, calendar_id, access_token, refresh_token, token_expires_at, is_active')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw new GcalProviderError(`Falha ao ler conexao Google: ${error.message}`)
  if (!data) throw new GcalNotConnectedError()

  const connection = data as ConnectionRow

  // Linha existe mas desativada: ja sabemos que o token morreu (o refresh
  // anterior gravou is_active=false). Isso e "reconectar", nao "conectar",
  // e a UI mostra mensagens diferentes para cada caso.
  if (!connection.is_active) throw new GcalAuthError()

  const expiresAt = new Date(connection.token_expires_at).getTime()
  if (expiresAt - Date.now() > EXPIRY_SKEW_MS) {
    return { accessToken: connection.access_token, calendarId: connection.calendar_id }
  }

  return await refreshAccessToken(supabase, connection)
}

async function refreshAccessToken(
  supabase: SupabaseClient,
  connection: ConnectionRow,
): Promise<{ accessToken: string; calendarId: string }> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new GcalProviderError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET nao configurados')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const body = await res.json() as TokenResponse

  if (!res.ok || !body.access_token) {
    const reason = body.error_description ?? body.error ?? `HTTP ${res.status}`

    // invalid_grant = o usuario revogou o acesso em myaccount.google.com.
    // Nao adianta tentar de novo: marca a conexao como morta para a UI pedir
    // reconexao em vez de repetir a falha em silencio a cada agendamento.
    if (body.error === 'invalid_grant') {
      await supabase
        .from(CONNECTIONS_TABLE)
        .update({ is_active: false, last_error: reason })
        .eq('id', connection.id)
      throw new GcalAuthError(reason)
    }

    throw new GcalProviderError(`Falha ao renovar token do Google: ${reason}`)
  }

  const expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString()

  await supabase
    .from(CONNECTIONS_TABLE)
    .update({
      access_token: body.access_token,
      token_expires_at: expiresAt,
      is_active: true,
      last_error: null,
    })
    .eq('id', connection.id)

  return { accessToken: body.access_token, calendarId: connection.calendar_id }
}

async function callCalendar(
  accessToken: string,
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: GcalEvent,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  // DELETE bem sucedido responde 204 sem corpo.
  if (res.status === 204) return {}

  const text = await res.text()
  const parsed = text ? JSON.parse(text) as Record<string, unknown> : {}

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GcalAuthError(extractGoogleError(parsed) ?? `HTTP ${res.status}`)
    }
    throw new GcalProviderError(extractGoogleError(parsed) ?? `HTTP ${res.status}`)
  }

  return parsed
}

function extractGoogleError(payload: Record<string, unknown>): string | null {
  const error = payload.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  return null
}

/**
 * Cria o evento e pede ao Google que envie o convite aos participantes.
 * Retorna o id do evento, que vira tasks.google_event_id.
 */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: GcalEvent,
): Promise<string> {
  const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events?sendUpdates=all`
  const created = await callCalendar(accessToken, url, 'POST', event)

  const eventId = created.id
  if (typeof eventId !== 'string') {
    throw new GcalProviderError('Google criou o evento mas nao devolveu o id')
  }
  return eventId
}

/** Atualiza o evento e notifica os participantes. Usado a partir da Onda 2. */
export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GcalEvent>,
): Promise<void> {
  const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`
  await callCalendar(accessToken, url, 'PATCH', event as GcalEvent)
}

/** Cancela o evento e notifica os participantes. Usado a partir da Onda 2. */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`
  await callCalendar(accessToken, url, 'DELETE')
}

/**
 * Monta o corpo do evento a partir da tarefa de reuniao.
 *
 * Minimizacao: saem daqui apenas titulo, descricao, horario, link e o par
 * nome/email do lead. Nada mais da tarefa nem do lead atravessa para o Google.
 *
 * @param leadName nome do lead, ou string vazia. NUNCA um substituto derivado
 *        de outro dado pessoal (telefone, documento): sem nome, omite-se.
 */
export function buildEventFromTask(task: GcalTaskInput, leadName: string): GcalEvent {
  const start = new Date(task.meeting_date)
  const durationMin = task.meeting_duration ?? DEFAULT_DURATION_MIN
  const end = new Date(start.getTime() + durationMin * 60 * 1000)

  const event: GcalEvent = {
    summary: task.title,
    start: { dateTime: start.toISOString(), timeZone: MEETING_TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: MEETING_TIME_ZONE },
  }

  if (task.description) event.description = task.description
  if (task.meeting_link) event.location = task.meeting_link
  if (task.meeting_lead_email) {
    // displayName so quando ha nome de verdade. Sem ele o Google exibe o
    // proprio email do participante, que e informacao que o cliente ja tem
    // sobre si mesmo. Nao ha substituto: telefone nao entra aqui.
    const attendee: GcalEventAttendee = { email: task.meeting_lead_email }
    if (leadName) attendee.displayName = leadName
    event.attendees = [attendee]
  }

  return event
}
