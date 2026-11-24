import { describe, it, expect } from 'vitest'
import { isAckMessage, needsReply, isOverdue } from './needs-reply'
import type { LeadWithLastMessage } from '@/types/database'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.parse('2026-11-20T15:00:00.000Z')

const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()

const conv = (
  sender: 'lead' | 'human' | 'ai' | null,
  msAgo: number,
  opts: { status?: LeadWithLastMessage['conversation_status']; content?: string; type?: string } = {},
) => ({
  conversation_status: opts.status ?? 'unread',
  last_message: sender
    ? {
        sender_type: sender,
        created_at: at(msAgo),
        content: opts.content ?? 'Consegue me mandar o orçamento?',
        message_type: (opts.type ?? 'text') as 'text',
      }
    : null,
}) as Pick<LeadWithLastMessage, 'conversation_status' | 'last_message'>

describe('isAckMessage', () => {
  it.each([
    'Combinado ☺',
    'Ok 👍',
    'Sim',
    'Obrigado pelo envio',
    'Muito obrigada',
    'ok, valeu!',
    'Perfeito, obrigado',
    'Bom dia',
    '👍',
    '🙏🏽🙏🏽',
    'kkkk',
    '',
  ])('fechamento: %s', (text) => {
    expect(isAckMessage(text, 'text')).toBe(true)
  })

  it.each([
    'Olá bom dia! Tudo bem e com você? Queria saber o valor',
    'Ok, e quanto fica?',
    'Sim, pode mandar o contrato para meu email',
    'Qual o horário de vocês?',
  ])('precisa de resposta: %s', (text) => {
    expect(isAckMessage(text, 'text')).toBe(false)
  })

  it('sticker e reação são fechamento', () => {
    expect(isAckMessage(null, 'sticker')).toBe(true)
    expect(isAckMessage('👍', 'reaction')).toBe(true)
  })

  it('áudio, imagem, documento e vídeo podem pedir resposta', () => {
    for (const t of ['audio', 'image', 'document', 'video']) {
      expect(isAckMessage(null, t)).toBe(false)
    }
  })

  it('texto só de palavras de fechamento mas longo demais pede resposta', () => {
    expect(isAckMessage('ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok', 'text')).toBe(false)
  })
})

describe('needsReply', () => {
  it('mensagem real do lead por último', () => {
    expect(needsReply(conv('lead', 0))).toBe(true)
  })
  it('IA ou vendedor por último: não', () => {
    expect(needsReply(conv('ai', 0))).toBe(false)
    expect(needsReply(conv('human', 0))).toBe(false)
  })
  it('fechamento do lead: não', () => {
    expect(needsReply(conv('lead', 0, { content: 'Combinado ☺' }))).toBe(false)
    expect(needsReply(conv('lead', 0, { type: 'sticker', content: '' }))).toBe(false)
  })
  it('áudio do lead: sim', () => {
    expect(needsReply(conv('lead', 0, { type: 'audio', content: '' }))).toBe(true)
  })
  it('waiting_client ou resolved: não', () => {
    expect(needsReply(conv('lead', 0, { status: 'waiting_client' }))).toBe(false)
    expect(needsReply(conv('lead', 0, { status: 'resolved' }))).toBe(false)
  })
  it('sem mensagens: não', () => {
    expect(needsReply(conv(null, 0))).toBe(false)
  })
})

describe('isOverdue', () => {
  it('mais que o prazo: sim; exatamente no prazo ou antes: não', () => {
    expect(isOverdue(conv('lead', 2 * HOUR + 1), 2, NOW)).toBe(true)
    expect(isOverdue(conv('lead', 2 * HOUR), 2, NOW)).toBe(false)
    expect(isOverdue(conv('lead', 2 * HOUR - MIN), 2, NOW)).toBe(false)
  })
  it('usa o sla_hours da empresa', () => {
    expect(isOverdue(conv('lead', 3 * HOUR), 4, NOW)).toBe(false)
    expect(isOverdue(conv('lead', 5 * HOUR), 4, NOW)).toBe(true)
  })
  it('sla_hours inválido ou <= 0 cai em 2h', () => {
    expect(isOverdue(conv('lead', 2 * HOUR + MIN), 0, NOW)).toBe(true)
    expect(isOverdue(conv('lead', 2 * HOUR + MIN), undefined, NOW)).toBe(true)
    expect(isOverdue(conv('lead', 30 * MIN), 0, NOW)).toBe(false)
  })
  it('fechamento antigo, IA por último e waiting_client: nunca atrasa', () => {
    expect(isOverdue(conv('lead', 10 * HOUR, { content: 'Ok 👍' }), 2, NOW)).toBe(false)
    expect(isOverdue(conv('ai', 10 * HOUR), 2, NOW)).toBe(false)
    expect(isOverdue(conv('lead', 10 * HOUR, { status: 'waiting_client' }), 2, NOW)).toBe(false)
  })
})
