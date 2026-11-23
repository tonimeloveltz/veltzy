import { describe, expect, it } from 'vitest'
import { computeEventStats } from './event-stats'

const row = (o: Partial<{ status: string; created_at: string; confirmed_at: string | null; checked_in_at: string | null; ref_code: string | null; utm_source: string | null }>) => ({
  status: 'registered', created_at: '2026-11-10T15:00:00Z', confirmed_at: null, checked_in_at: null,
  ref_code: null, utm_source: null, ...o,
}) as Parameters<typeof computeEventStats>[0][number]

const opts = { capacity: 10, createdAt: '2026-11-08T12:00:00Z', timeZone: 'America/Sao_Paulo', now: new Date('2026-11-12T12:00:00Z') }

describe('computeEventStats', () => {
  it('ignora cancelados e conta confirmados, presentes e vagas', () => {
    const s = computeEventStats([
      row({}), row({ confirmed_at: '2026-11-11T10:00:00Z' }),
      row({ status: 'attended', confirmed_at: '2026-11-11T10:00:00Z', checked_in_at: '2026-11-12T11:00:00Z' }),
      row({ status: 'canceled' }),
    ], opts)
    expect(s.registered).toBe(3)
    expect(s.confirmed).toBe(2)
    expect(s.confirmedPct).toBe(67)
    expect(s.attended).toBe(1)
    expect(s.remaining).toBe(7)
    expect(s.funnel).toEqual({ registered: 3, confirmed: 2, attended: 1 })
  })

  it('taxa de presenca so com presentes ou ausentes', () => {
    expect(computeEventStats([row({})], opts).attendanceRate).toBeNull()
    expect(computeEventStats([row({ status: 'attended' }), row({ status: 'absent' }), row({ status: 'absent' })], opts).attendanceRate).toBe(33)
  })

  it('dias no fuso do evento, desde a criacao', () => {
    // 11/11 01:00 UTC = 10/11 22:00 em Sao Paulo
    const s = computeEventStats([row({ created_at: '2026-11-11T01:00:00Z' })], opts)
    expect(s.perDay.map((d) => d.label)).toEqual(['08/11', '09/11', '10/11', '11/11', '12/11'])
    expect(s.perDay.find((d) => d.label === '10/11')?.registrations).toBe(1)
  })

  it('nao inventa o dia de amanha quando a hora da criacao e mais tarde que a de agora', () => {
    const s = computeEventStats([], { ...opts, createdAt: '2026-11-10T20:00:00Z', now: new Date('2026-11-12T13:00:00Z') })
    expect(s.perDay.map((d) => d.label)).toEqual(['10/11', '11/11', '12/11'])
  })

  it('no maximo 14 dias', () => {
    const s = computeEventStats([], { ...opts, createdAt: '2026-09-01T00:00:00Z' })
    expect(s.perDay).toHaveLength(14)
    expect(s.perDay.at(-1)?.label).toBe('12/11')
  })

  it('origem: ref, depois utm, depois direto', () => {
    const s = computeEventStats([row({ ref_code: 'ana' }), row({ ref_code: 'ana', status: 'attended' }), row({ utm_source: 'ig' }), row({})], opts)
    expect(s.byOrigin).toEqual([
      { origin: 'ref: ana', registrations: 2, attended: 1 },
      { origin: 'utm: ig', registrations: 1, attended: 0 },
      { origin: 'direto', registrations: 1, attended: 0 },
    ])
  })
})
