import { veltzy as db, supabase } from '@/lib/supabase'
import { toEdgeFunctionError } from '@/lib/edge-function-error'
import type { InstagramConnectionSummary } from '@/lib/instagram-connection-state'

const CONNECTION_COLUMNS =
  'id, instagram_username, instagram_name, status, is_active, auth_flow, token_expires_at, webhook_subscribed_at, last_error'

/** Leitura por RLS (vz_ig_select). O token nunca sai do Vault. */
export const getInstagramConnection = async (companyId: string): Promise<InstagramConnectionSummary | null> => {
  const { data, error } = await db()
    .from('instagram_connections')
    .select(CONNECTION_COLUMNS)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  return (data as InstagramConnectionSummary | null) ?? null
}

const invokeInstagramOAuth = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('instagram-oauth', { body })
  if (error) throw await toEdgeFunctionError(error)
  return data as T
}

/** URL do instagram.com para o admin autorizar. company e redirect_uri sao decididos no servidor. */
export const startInstagramAuthorize = async (): Promise<string> => {
  const { url } = await invokeInstagramOAuth<{ url: string }>({ action: 'authorize' })
  return url
}

export const completeInstagramOAuth = (
  code: string,
  state: string,
): Promise<{ success: true; warning?: string }> =>
  invokeInstagramOAuth({ action: 'callback', code, state })

export const disconnectInstagram = async (): Promise<void> => {
  await invokeInstagramOAuth<{ success: true }>({ action: 'disconnect' })
}
