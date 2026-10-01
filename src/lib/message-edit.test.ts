import { describe, it, expect } from 'vitest'
import { canEditMessage, EDIT_WINDOW_MS } from './message-edit'
import type { Message } from '@/types/database'

/**
 * Cada caso fixa o created_at relativo a Date.now() no momento da chamada, que e
 * o mesmo relogio que o componente usa no render. Nada depende do fuso.
 */
const msg = (over: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  lead_id: 'lead-1',
  company_id: 'company-1',
  content: 'oi',
  sender_type: 'human',
  message_type: 'text',
  file_url: null,
  file_name: null,
  file_mime_type: null,
  file_size: null,
  source: 'whatsapp',
  external_id: 'true_5511999@c.us_AAA',
  replied_message_id: null,
  instance_name: 'numero-1',
  delivery_status: 'sent',
  delivery_error: null,
  whatsapp_provider: 'waha',
  edited_at: null,
  original_content: null,
  is_scheduled: false,
  scheduled_at: null,
  is_read: true,
  created_at: new Date().toISOString(),
  ...over,
})

describe('canEditMessage', () => {
  it('libera mensagem de texto enviada agora pela empresa', () => {
    expect(canEditMessage(msg())).toBe(true)
    expect(canEditMessage(msg({ sender_type: 'ai' }))).toBe(true)
  })

  it('barra mensagem recebida do lead', () => {
    expect(canEditMessage(msg({ sender_type: 'lead' }))).toBe(false)
  })

  it('barra o que nao e texto: a Evolution nao edita legenda de midia', () => {
    expect(canEditMessage(msg({ message_type: 'image' }))).toBe(false)
    expect(canEditMessage(msg({ message_type: 'audio' }))).toBe(false)
  })

  it('barra mensagem que nao chegou a sair', () => {
    expect(canEditMessage(msg({ delivery_status: 'failed' }))).toBe(false)
  })

  it('libera Evolution e barra os providers que nao editam', () => {
    expect(canEditMessage(msg({ whatsapp_provider: 'evolution' }))).toBe(true)
    expect(canEditMessage(msg({ whatsapp_provider: 'cloud_api' }))).toBe(false)
    expect(canEditMessage(msg({ whatsapp_provider: 'zapi' }))).toBe(false)
  })

  it('barra provider NULL: mensagem anterior ao carimbo do whatsapp-send', () => {
    expect(canEditMessage(msg({ whatsapp_provider: null }))).toBe(false)
  })

  it('barra mensagem sem external_id: as antigas nunca serao editaveis', () => {
    expect(canEditMessage(msg({ external_id: null }))).toBe(false)
  })

  it('barra a bolha otimista, que ainda nao tem linha no banco', () => {
    expect(canEditMessage(msg({ id: 'optimistic-123' }))).toBe(false)
  })

  it('barra fora da janela de 15 minutos do WhatsApp', () => {
    const expirada = new Date(Date.now() - EDIT_WINDOW_MS - 1000).toISOString()
    expect(canEditMessage(msg({ created_at: expirada }))).toBe(false)

    const dentro = new Date(Date.now() - 60 * 1000).toISOString()
    expect(canEditMessage(msg({ created_at: dentro }))).toBe(true)
  })
})
