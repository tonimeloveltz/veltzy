import { supabase } from '@/lib/supabase'

/**
 * Conexao do Google Calendar. Uma linha por profile (vendedor): a agenda e de
 * quem atende, nao da empresa.
 *
 * A tabela guarda access_token e refresh_token, mas eles NUNCA sao lidos aqui.
 * O SELECT desta camada pede apenas o que a UI mostra. Quem usa token e a edge
 * function, com service role.
 */
export interface GoogleCalendarConnection {
  id: string
  google_email: string
  calendar_id: string
  is_active: boolean
  last_error: string | null
  created_at: string
}

const CONNECTION_FIELDS = 'id, google_email, calendar_id, is_active, last_error, created_at'

/** Chave do nonce anti-CSRF do fluxo OAuth, conferido na volta do Google. */
const OAUTH_STATE_KEY = 'gcal_oauth_state'

/** Extrai a mensagem real do corpo da resposta da edge function. */
const readInvokeError = async (error: unknown): Promise<string> => {
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as Record<string, unknown>
      if (typeof body.error === 'string') return body.error
    } catch {
      // corpo nao e JSON: cai no message generico abaixo
    }
  }
  return error instanceof Error ? error.message : 'Erro inesperado'
}

export const getConnection = async (
  profileId: string,
): Promise<GoogleCalendarConnection | null> => {
  const { data, error } = await supabase
    .from('google_calendar_connections')
    .select(CONNECTION_FIELDS)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data as GoogleCalendarConnection | null
}

/**
 * Devolve a URL de consentimento do Google e guarda o nonce em sessionStorage
 * para conferencia na volta.
 */
export const startAuthorization = async (): Promise<string> => {
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  const { data, error } = await supabase.functions.invoke('gcal-oauth', {
    body: { action: 'authorize', state },
  })
  if (error) throw new Error(await readInvokeError(error))
  return data.url as string
}

/** Le e descarta o nonce guardado. Serve uma vez so, de proposito. */
export const takeStoredAuthState = (): string | null => {
  const state = sessionStorage.getItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  return state
}

export const completeCallback = async (code: string, state: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('gcal-oauth', {
    body: { action: 'callback', code, state },
  })
  if (error) throw new Error(await readInvokeError(error))
  return data.googleEmail as string
}

/**
 * Resultado da tentativa de criar o evento. Nenhuma variante e excecao: a
 * tarefa ja foi criada em todas elas, e o vendedor precisa saber o que
 * aconteceu com o convite, nao com o sistema.
 */
export type CalendarEventResult =
  | { status: 'created'; eventId: string }
  | { status: 'not_connected' }
  | { status: 'auth_expired'; message?: string }
  | { status: 'provider_error'; message?: string }
  | { status: 'failed'; message: string }

/**
 * Pede a edge function que crie o evento da tarefa no Google.
 * Manda so o taskId: token nenhum passa pelo browser.
 */
export const createCalendarEventForTask = async (
  taskId: string,
): Promise<CalendarEventResult> => {
  const { data, error } = await supabase.functions.invoke('calendar-event', {
    body: { action: 'create', taskId },
  })
  if (error) return { status: 'failed', message: await readInvokeError(error) }

  const payload = (data ?? {}) as { eventId?: string; skipped?: string; message?: string }

  if (payload.eventId) return { status: 'created', eventId: payload.eventId }
  if (payload.skipped === 'not_connected') return { status: 'not_connected' }
  if (payload.skipped === 'auth_expired') return { status: 'auth_expired', message: payload.message }
  if (payload.skipped === 'provider_error') {
    return { status: 'provider_error', message: payload.message }
  }

  return { status: 'failed', message: 'Resposta inesperada ao criar o evento' }
}

export const disconnect = async (): Promise<void> => {
  const { error } = await supabase.functions.invoke('gcal-oauth', {
    body: { action: 'disconnect' },
  })
  if (error) throw new Error(await readInvokeError(error))
}
