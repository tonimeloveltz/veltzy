import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { filterByPeriod } from './deals-period-filter'
import type { DealWithLead } from '@/types/database'

const deal = (over: Partial<DealWithLead>): DealWithLead =>
  ({
    id: 'd', company_id: 'c', lead_id: 'l1', name: 'N', value: 0,
    stage_id: 's1', pipeline_id: 'p1', assigned_to: null, status: 'open',
    closed_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as DealWithLead)

describe('filterByPeriod (pagina Negocios)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Total (days indefinido) retorna tudo sem filtro de data', () => {
    const deals = [
      deal({ id: 'a', status: 'open', created_at: '2025-01-01T00:00:00Z' }),
      deal({ id: 'b', status: 'won', closed_at: '2025-01-01T00:00:00Z' }),
    ]
    expect(filterByPeriod(deals, undefined)).toHaveLength(2)
  })

  it('abertos (open/pending) entram sempre, independente das datas', () => {
    const deals = [
      deal({ id: 'a', status: 'open', created_at: '2020-01-01T00:00:00Z', closed_at: null }),
      deal({ id: 'b', status: 'pending_assignment', created_at: '2020-01-01T00:00:00Z', closed_at: null }),
    ]
    // periodo "Mes" (30 dias): cutoff 2026-05-16
    const result = filterByPeriod(deals, 30)
    expect(result.map((d) => d.id).sort()).toEqual(['a', 'b'])
  })

  it('fechados (won/lost) entram so se closed_at cair no range', () => {
    const deals = [
      deal({ id: 'dentro-won', status: 'won', closed_at: '2026-06-10T00:00:00Z' }),
      deal({ id: 'dentro-lost', status: 'lost', closed_at: '2026-06-01T00:00:00Z' }),
      deal({ id: 'fora-won', status: 'won', closed_at: '2026-01-01T00:00:00Z' }),
      deal({ id: 'sem-data', status: 'lost', closed_at: null }),
    ]
    const result = filterByPeriod(deals, 30).map((d) => d.id).sort()
    expect(result).toEqual(['dentro-lost', 'dentro-won'])
  })

  it('combina: abertos constantes + fechados variando por periodo', () => {
    const deals = [
      deal({ id: 'open1', status: 'open', closed_at: null }),
      deal({ id: 'open2', status: 'pending_assignment', closed_at: null }),
      deal({ id: 'won-jun', status: 'won', closed_at: '2026-06-14T00:00:00Z' }),
      deal({ id: 'won-jan', status: 'won', closed_at: '2026-01-01T00:00:00Z' }),
    ]
    // Mes: abertos (2) + 1 fechado de junho
    expect(filterByPeriod(deals, 30).map((d) => d.id).sort())
      .toEqual(['open1', 'open2', 'won-jun'])
    // Hoje (1 dia): abertos constantes, nenhum fechado no range
    expect(filterByPeriod(deals, 1).map((d) => d.id).sort())
      .toEqual(['open1', 'open2'])
    // Total: tudo
    expect(filterByPeriod(deals, undefined)).toHaveLength(4)
  })
})
