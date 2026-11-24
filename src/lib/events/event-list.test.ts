import { describe, it, expect } from 'vitest'
import {
  capacityPercent, eventDateBlock, eventListTab, eventPublicUrl, eventStatusBadge, eventSummaryLine,
  groupByTab, showAttendance, type EventListItem,
} from './event-list'

// "agora" fixo: 17/11/2026 12:00 SP (15:00Z)
const now = new Date('2026-11-17T15:00:00Z')

const base: EventListItem = {
  id: 'x', slug: 's', title: 'T', status: 'published', closed_reason: null, format: 'presencial',
  starts_at: '2026-11-28T12:00:00Z', ends_at: '2026-11-28T20:00:00Z', timezone: 'America/Sao_Paulo',
  city: 'São Paulo', state: 'SP', capacity: 100, updated_at: '2026-11-10T00:00:00Z',
}

describe('eventListTab', () => {
  it('rascunho fica em Rascunhos mesmo com data passada', () => {
    expect(eventListTab({ status: 'draft', ends_at: '2020-01-01T00:00:00Z' }, now)).toBe('drafts')
  })
  it('publicado e fechado com fim futuro: Proximos', () => {
    expect(eventListTab({ status: 'published', ends_at: base.ends_at }, now)).toBe('upcoming')
    expect(eventListTab({ status: 'closed', ends_at: base.ends_at }, now)).toBe('upcoming')
  })
  it('publicado com fim no passado: Encerrados', () => {
    expect(eventListTab({ status: 'published', ends_at: '2026-11-17T14:59:00Z' }, now)).toBe('ended')
  })
  it('finalizado e cancelado: Encerrados mesmo no futuro', () => {
    expect(eventListTab({ status: 'finished', ends_at: base.ends_at }, now)).toBe('ended')
    expect(eventListTab({ status: 'canceled', ends_at: base.ends_at }, now)).toBe('ended')
  })
})

describe('groupByTab', () => {
  it('ordena Proximos pelo inicio e Encerrados do mais recente', () => {
    const a = { ...base, id: 'a', starts_at: '2026-12-10T12:00:00Z', ends_at: '2026-12-10T15:00:00Z' }
    const b = { ...base, id: 'b', starts_at: '2026-11-20T12:00:00Z', ends_at: '2026-11-20T15:00:00Z' }
    const c = { ...base, id: 'c', status: 'finished' as const, starts_at: '2026-10-01T12:00:00Z' }
    const d = { ...base, id: 'd', status: 'canceled' as const, starts_at: '2026-11-01T12:00:00Z' }
    const g = groupByTab([a, b, c, d], now)
    expect(g.upcoming.map((e) => e.id)).toEqual(['b', 'a'])
    expect(g.ended.map((e) => e.id)).toEqual(['d', 'c'])
  })
  it('Rascunhos: editado por ultimo primeiro', () => {
    const a = { ...base, id: 'a', status: 'draft' as const, updated_at: '2026-11-01T00:00:00Z' }
    const b = { ...base, id: 'b', status: 'draft' as const, updated_at: '2026-11-15T00:00:00Z' }
    expect(groupByTab([a, b], now).drafts.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('eventStatusBadge', () => {
  it('fechado por vaga e Esgotado; por prazo ou manual, Inscrições encerradas', () => {
    expect(eventStatusBadge('closed', 'capacity').label).toBe('Esgotado')
    expect(eventStatusBadge('closed', 'deadline').label).toBe('Inscrições encerradas')
    expect(eventStatusBadge('closed', 'manual').label).toBe('Inscrições encerradas')
  })
  it('demais status', () => {
    expect(eventStatusBadge('draft', null).label).toBe('Rascunho')
    expect(eventStatusBadge('published', null).label).toBe('Publicado')
    expect(eventStatusBadge('finished', null).label).toBe('Finalizado')
    expect(eventStatusBadge('canceled', null).label).toBe('Cancelado')
  })
})

describe('eventSummaryLine', () => {
  it('mesmo dia, no fuso do evento', () => {
    // 28/11/2026 e sabado; 12:00Z = 09:00 SP
    expect(eventSummaryLine(base)).toBe('sáb · 09:00 às 17:00 · Presencial · São Paulo, SP')
  })
  it('fuso do evento, nao o do navegador', () => {
    expect(eventSummaryLine({ ...base, timezone: 'America/Manaus' })).toBe('sáb · 08:00 às 16:00 · Presencial · São Paulo, SP')
  })
  it('fim em outro dia', () => {
    expect(eventSummaryLine({ ...base, ends_at: '2026-11-29T15:00:00Z' })).toBe('sáb 09:00 até 29/11 12:00 · Presencial · São Paulo, SP')
  })
  it('online nao mostra cidade; sem data', () => {
    expect(eventSummaryLine({ ...base, format: 'online', starts_at: null, ends_at: null })).toBe('Sem data · Online')
  })
  it('sem em dash', () => {
    expect(eventSummaryLine(base)).not.toContain('—')
  })
})

describe('eventDateBlock', () => {
  it('dia e mes no fuso do evento; virada de dia', () => {
    expect(eventDateBlock('2026-11-28T12:00:00Z', 'America/Sao_Paulo')).toEqual({ day: '28', month: 'nov' })
    expect(eventDateBlock('2026-12-01T02:00:00Z', 'America/Sao_Paulo')).toEqual({ day: '30', month: 'nov' })
    expect(eventDateBlock(null, 'America/Sao_Paulo')).toBeNull()
  })
})

describe('auxiliares', () => {
  it('presentes so depois do inicio', () => {
    expect(showAttendance('2026-11-17T14:00:00Z', now)).toBe(true)
    expect(showAttendance('2026-11-17T16:00:00Z', now)).toBe(false)
    expect(showAttendance(null, now)).toBe(false)
  })
  it('link publico', () => {
    expect(eventPublicUrl('meu-evento', 'https://develop.veltzy.com/')).toBe('https://develop.veltzy.com/e/meu-evento')
  })
  it('ocupacao', () => {
    expect(capacityPercent(25, 100)).toBe(25)
    expect(capacityPercent(150, 100)).toBe(100)
    expect(capacityPercent(10, null)).toBeNull()
  })
})
