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
    // periodo "Mes": cutoff 2026-06-01
    const result = filterByPeriod(deals, 30)
    expect(result.map((d) => d.id).sort()).toEqual(['a', 'b'])
  })

  it('fechados (won/lost) entram so se closed_at cair no range', () => {
    const deals = [
      deal({ id: 'dentro-won', status: 'won', closed_at: '2026-06-10T12:00:00Z' }),
      deal({ id: 'dentro-lost', status: 'lost', closed_at: '2026-06-05T12:00:00Z' }),
      deal({ id: 'fora-won', status: 'won', closed_at: '2026-01-01T12:00:00Z' }),
      deal({ id: 'sem-data', status: 'lost', closed_at: null }),
    ]
    const result = filterByPeriod(deals, 30).map((d) => d.id).sort()
    expect(result).toEqual(['dentro-lost', 'dentro-won'])
  })

  it('"Mes" e o mes CORRENTE: fechado do mes passado fica de fora mesmo dentro de 30 dias', () => {
    // A mudanca de semantica. Em 15/06, 20/05 esta a 26 dias e entrava na janela
    // deslizante antiga; agora nao entra, porque o rotulo diz "Mes".
    const deals = [
      deal({ id: 'maio', status: 'won', closed_at: '2026-05-20T12:00:00Z' }),
      deal({ id: 'junho', status: 'won', closed_at: '2026-06-02T12:00:00Z' }),
    ]
    expect(filterByPeriod(deals, 30).map((d) => d.id)).toEqual(['junho'])
  })

  it('"Semana" e a semana corrente, a partir de domingo', () => {
    // 15/06/2026 e segunda: a semana comecou domingo 14. O fechado na
    // sexta-feira anterior (12) fica de fora, ainda que a 3 dias.
    const deals = [
      deal({ id: 'sexta-passada', status: 'won', closed_at: '2026-06-12T12:00:00Z' }),
      deal({ id: 'domingo', status: 'won', closed_at: '2026-06-14T12:00:00Z' }),
    ]
    expect(filterByPeriod(deals, 7).map((d) => d.id)).toEqual(['domingo'])
  })

  it('arquivados entram sempre, mesmo sem closed_at e com created_at antigo', () => {
    // Arquivar so troca o status, nao grava closed_at: filtrar por data cortaria
    // todo arquivado e o toggle "Mostrar arquivados" nunca mostraria nada.
    const deals = [
      deal({ id: 'arq-sem-data', status: 'archived', closed_at: null, created_at: '2020-01-01T00:00:00Z' }),
      deal({ id: 'arq-data-velha', status: 'archived', closed_at: '2020-01-01T00:00:00Z' }),
    ]
    expect(filterByPeriod(deals, 30).map((d) => d.id).sort())
      .toEqual(['arq-data-velha', 'arq-sem-data'])
    expect(filterByPeriod(deals, 1)).toHaveLength(2)
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
