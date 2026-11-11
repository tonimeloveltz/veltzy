import { describe, it, expect } from 'vitest'
import { hasPendingReply, isResponseOverdue, responseSlaMs } from './response-sla'
import type { LeadWithLastMessage } from '@/types/database'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.parse('2026-11-11T15:00:00.000Z')
const SLA = 2 * HOUR

const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()

const conv = (
  sender: 'lead' | 'human' | 'ai' | null,
  msAgo: number,
  status: LeadWithLastMessage['conversation_status'] = 'unread',
) => ({
  conversation_status: status,
  last_message: sender
    ? { sender_type: sender, created_at: at(msAgo), content: 'oi', message_type: 'text' as const }
    : null,
})

describe('responseSlaMs', () => {
  it('usa sla_hours da empresa', () => {
    expect(responseSlaMs(4)).toBe(4 * HOUR)
  })
  it('cai em 2h quando ausente, zero ou invalido (nao mais 30 min)', () => {
    expect(responseSlaMs(undefined)).toBe(2 * HOUR)
    expect(responseSlaMs(null)).toBe(2 * HOUR)
    expect(responseSlaMs(0)).toBe(2 * HOUR)
    expect(responseSlaMs(Number.NaN)).toBe(2 * HOUR)
  })
})

describe('isResponseOverdue: limites de tempo', () => {
  it('pendente ha 2h01: vermelho', () => {
    expect(isResponseOverdue(conv('lead', 2 * HOUR + MIN), SLA, NOW)).toBe(true)
  })
  it('pendente ha 2h + 1ms: vermelho', () => {
    expect(isResponseOverdue(conv('lead', 2 * HOUR + 1), SLA, NOW)).toBe(true)
  })
  it('pendente ha exatamente 2h: NAO vermelho', () => {
    expect(isResponseOverdue(conv('lead', 2 * HOUR), SLA, NOW)).toBe(false)
  })
  it('pendente ha 1h59: NAO vermelho', () => {
    expect(isResponseOverdue(conv('lead', 2 * HOUR - MIN), SLA, NOW)).toBe(false)
  })
  it('pendente ha 30 min: NAO vermelho (antigo fallback do check-sla)', () => {
    expect(isResponseOverdue(conv('lead', 30 * MIN), SLA, NOW)).toBe(false)
  })
})

describe('isResponseOverdue: conversas respondidas', () => {
  it('vendedor respondeu por ultimo, mesmo apos dias: NAO vermelho', () => {
    expect(isResponseOverdue(conv('human', 3 * 24 * HOUR), SLA, NOW)).toBe(false)
  })
  it('IA (SDR) respondeu por ultimo: NAO vermelho', () => {
    expect(isResponseOverdue(conv('ai', 5 * HOUR), SLA, NOW)).toBe(false)
  })
  it('conversa resolvida com ultima mensagem do lead: NAO vermelho', () => {
    expect(isResponseOverdue(conv('lead', 5 * HOUR, 'resolved'), SLA, NOW)).toBe(false)
  })
  it('sem mensagens: NAO vermelho', () => {
    expect(isResponseOverdue(conv(null, 0), SLA, NOW)).toBe(false)
  })
})

describe('isResponseOverdue: nova mensagem do lead apos resposta', () => {
  // Lead atrasou 5h no passado, foi respondido, e escreveu de novo ha 10 min.
  // O relogio parte da mensagem nova: o atraso antigo nao e reaproveitado.
  it('mensagem nova ha 10 min: NAO vermelho', () => {
    expect(isResponseOverdue(conv('lead', 10 * MIN), SLA, NOW)).toBe(false)
  })
  it('a mesma mensagem nova passa a vermelho so depois de 2h', () => {
    const lead = conv('lead', 10 * MIN)
    expect(isResponseOverdue(lead, SLA, NOW + 110 * MIN)).toBe(false)
    expect(isResponseOverdue(lead, SLA, NOW + 110 * MIN + 1)).toBe(true)
  })
})

describe('hasPendingReply', () => {
  it('so a ultima mensagem do lead deixa pendente', () => {
    expect(hasPendingReply(conv('lead', 0))).toBe(true)
    expect(hasPendingReply(conv('human', 0))).toBe(false)
    expect(hasPendingReply(conv('ai', 0))).toBe(false)
  })
})
