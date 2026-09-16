import type { InstagramConnection } from '@/types/database'

/** Colunas nao secretas que o front le de instagram_connections (RLS vz_ig_select). */
export type InstagramConnectionSummary = Pick<
  InstagramConnection,
  'id' | 'instagram_username' | 'instagram_name' | 'status' | 'is_active' | 'auth_flow'
  | 'token_expires_at' | 'webhook_subscribed_at' | 'last_error'
>

export type InstagramCardState = 'not_connected' | 'connected' | 'needs_reconnect'

export interface InstagramReconnectReason {
  title: string
  detail: string | null
}

const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export const formatDateBR = (iso: string): string => dateFormatter.format(new Date(iso))

const isExpiringSoon = (connection: InstagramConnectionSummary, now: Date): boolean =>
  !!connection.token_expires_at
  && new Date(connection.token_expires_at).getTime() - now.getTime() < EXPIRING_SOON_MS

/**
 * Desconexao manual (revoked sem last_error) volta para "Conectar".
 * Desautorizacao pela Meta, token vencido, erro, conexao antiga ou token perto
 * de expirar pedem "Reconectar".
 */
export const instagramCardState = (
  connection: InstagramConnectionSummary | null | undefined,
  now: Date,
): InstagramCardState => {
  if (!connection) return 'not_connected'
  if (!connection.is_active && connection.status === 'revoked' && !connection.last_error) return 'not_connected'
  if (!connection.is_active || connection.status !== 'active') return 'needs_reconnect'
  if (connection.auth_flow === 'facebook_login' || isExpiringSoon(connection, now)) return 'needs_reconnect'
  return 'connected'
}

export const instagramReconnectReason = (
  connection: InstagramConnectionSummary,
  now: Date,
): InstagramReconnectReason | null => {
  const detail = connection.last_error
  if (connection.auth_flow === 'facebook_login') {
    return { title: 'Conexão antiga. Reconecte para usar a nova integração.', detail: null }
  }
  if (connection.status === 'token_expired') {
    return { title: 'O acesso ao Instagram expirou. Reconecte para voltar a receber mensagens.', detail }
  }
  if (connection.status === 'revoked' || !connection.is_active) {
    return { title: 'A conexão foi removida no Instagram. Reconecte para voltar a receber mensagens.', detail }
  }
  if (connection.status === 'error') {
    return { title: 'A conexão está com erro. Reconecte o Instagram.', detail }
  }
  if (isExpiringSoon(connection, now) && connection.token_expires_at) {
    return { title: `O acesso expira em ${formatDateBR(connection.token_expires_at)}. Reconecte para renovar.`, detail: null }
  }
  return null
}
