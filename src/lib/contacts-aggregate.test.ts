import { describe, it, expect } from 'vitest'
import { aggregateDealsByLead } from './contacts-aggregate'

describe('aggregateDealsByLead', () => {
  it('conta negocios e soma LTV por lead_id', () => {
    const map = aggregateDealsByLead([
      { lead_id: 'l1', value: 100 },
      { lead_id: 'l1', value: 250 },
      { lead_id: 'l2', value: 80 },
    ])
    expect(map.get('l1')).toEqual({ count: 2, ltv: 350 })
    expect(map.get('l2')).toEqual({ count: 1, ltv: 80 })
  })

  it('trata value null como 0 no LTV mas conta o negocio', () => {
    const map = aggregateDealsByLead([
      { lead_id: 'l1', value: null },
      { lead_id: 'l1', value: 200 },
    ])
    expect(map.get('l1')).toEqual({ count: 2, ltv: 200 })
  })

  it('lead sem negocios nao aparece no mapa', () => {
    const map = aggregateDealsByLead([{ lead_id: 'l1', value: 10 }])
    expect(map.has('l2')).toBe(false)
    expect(map.get('l2')).toBeUndefined()
  })

  it('lista vazia retorna mapa vazio', () => {
    expect(aggregateDealsByLead([]).size).toBe(0)
  })
})
