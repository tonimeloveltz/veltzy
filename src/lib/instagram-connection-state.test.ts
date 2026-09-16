import { describe, it, expect } from 'vitest'
import {
  instagramCardState,
  instagramReconnectReason,
  type InstagramConnectionSummary,
} from '@/lib/instagram-connection-state'

const NOW = new Date('2026-09-14T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const connection = (overrides: Partial<InstagramConnectionSummary> = {}): InstagramConnectionSummary => ({
  id: 'c-1',
  instagram_username: 'loja',
  instagram_name: 'Loja',
  status: 'active',
  is_active: true,
  auth_flow: 'instagram_login',
  token_expires_at: new Date(NOW.getTime() + 50 * DAY).toISOString(),
  webhook_subscribed_at: NOW.toISOString(),
  last_error: null,
  ...overrides,
})

describe('instagramCardState', () => {
  it('sem conexao: not_connected', () => {
    expect(instagramCardState(null, NOW)).toBe('not_connected')
  })

  it('desconexao manual (revoked sem last_error): not_connected', () => {
    expect(instagramCardState(connection({ is_active: false, status: 'revoked' }), NOW)).toBe('not_connected')
  })

  it('ativa e valida: connected', () => {
    expect(instagramCardState(connection(), NOW)).toBe('connected')
  })

  it('desautorizada pela Meta, token vencido ou erro: needs_reconnect', () => {
    expect(instagramCardState(connection({ is_active: false, status: 'revoked', last_error: 'App removido pelo Instagram' }), NOW)).toBe('needs_reconnect')
    expect(instagramCardState(connection({ status: 'token_expired' }), NOW)).toBe('needs_reconnect')
    expect(instagramCardState(connection({ status: 'error', last_error: 'Falha ao inscrever webhook' }), NOW)).toBe('needs_reconnect')
  })

  it('conexao antiga do Facebook Login: needs_reconnect', () => {
    expect(instagramCardState(connection({ auth_flow: 'facebook_login' }), NOW)).toBe('needs_reconnect')
  })

  it('token expira em menos de 7 dias: needs_reconnect', () => {
    const expiring = connection({ token_expires_at: new Date(NOW.getTime() + 6 * DAY).toISOString() })
    expect(instagramCardState(expiring, NOW)).toBe('needs_reconnect')
    expect(instagramReconnectReason(expiring, NOW)?.title).toContain('expira em')
  })
})

describe('instagramReconnectReason', () => {
  it('conexao antiga tem prioridade na mensagem', () => {
    expect(instagramReconnectReason(connection({ auth_flow: 'facebook_login', status: 'error' }), NOW)?.title)
      .toBe('Conexão antiga. Reconecte para usar a nova integração.')
  })

  it('leva o last_error como detalhe', () => {
    expect(instagramReconnectReason(connection({ status: 'error', last_error: 'Falha ao inscrever webhook: x' }), NOW))
      .toEqual({ title: 'A conexão está com erro. Reconecte o Instagram.', detail: 'Falha ao inscrever webhook: x' })
  })

  it('conexao saudavel nao tem motivo', () => {
    expect(instagramReconnectReason(connection(), NOW)).toBeNull()
  })
})
