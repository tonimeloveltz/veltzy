import { describe, it, expect } from 'vitest'
import { leadIdsInStages } from './stage-audience'

describe('leadIdsInStages (front)', () => {
  it('usa o deal aberto mais recente por lead (critério A estrito)', () => {
    const deals = [
      { lead_id: 'L1', stage_id: 'S_old', created_at: '2026-01-01T00:00:00Z' },
      { lead_id: 'L1', stage_id: 'S_new', created_at: '2026-02-01T00:00:00Z' },
      { lead_id: 'L2', stage_id: 'S_new', created_at: '2026-01-15T00:00:00Z' },
      { lead_id: 'L3', stage_id: 'S_other', created_at: '2026-03-01T00:00:00Z' },
    ]
    expect(leadIdsInStages(deals, ['S_new']).sort()).toEqual(['L1', 'L2'])
  })
  it('lead que moveu PARA FORA do stage não entra', () => {
    const deals = [
      { lead_id: 'L1', stage_id: 'S_alvo', created_at: '2026-01-01T00:00:00Z' },
      { lead_id: 'L1', stage_id: 'S_depois', created_at: '2026-02-01T00:00:00Z' },
    ]
    expect(leadIdsInStages(deals, ['S_alvo'])).toEqual([])
  })
  it('sem deals → vazio', () => {
    expect(leadIdsInStages([], ['S1'])).toEqual([])
  })
})
