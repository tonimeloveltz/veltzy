import { describe, it, expect } from 'vitest'
import { buildActiveDealInfo } from './active-deal-info'
import type { DealWithLead } from '@/types/database'

const deal = (over: Partial<DealWithLead>): DealWithLead =>
  ({
    id: 'd', company_id: 'c', lead_id: 'l1', name: 'N', value: 0,
    stage_id: 's1', pipeline_id: 'p1', assigned_to: null, status: 'open',
    closed_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as DealWithLead)

describe('buildActiveDealInfo', () => {
  it('ignora deals nao-abertos (won/lost/archived/pending)', () => {
    const info = buildActiveDealInfo([
      deal({ id: 'a', lead_id: 'l1', status: 'won' }),
      deal({ id: 'b', lead_id: 'l2', status: 'lost' }),
      deal({ id: 'c', lead_id: 'l3', status: 'archived' }),
      deal({ id: 'd', lead_id: 'l4', status: 'pending_assignment' }),
    ])
    expect(info.activeLeadIds.size).toBe(0)
    expect(info.stageByLeadId.size).toBe(0)
  })

  it('marca lead com deal aberto e mapeia o stage', () => {
    const info = buildActiveDealInfo([
      deal({ id: 'a', lead_id: 'l1', status: 'open', stage_id: 'stageX' }),
    ])
    expect(info.activeLeadIds.has('l1')).toBe(true)
    expect(info.stageByLeadId.get('l1')).toBe('stageX')
  })

  it('multi-deal: usa o stage do deal aberto MAIS RECENTE', () => {
    const info = buildActiveDealInfo([
      deal({ id: 'old', lead_id: 'l1', status: 'open', stage_id: 'antigo', created_at: '2026-01-01T00:00:00Z' }),
      deal({ id: 'new', lead_id: 'l1', status: 'open', stage_id: 'recente', created_at: '2026-03-01T00:00:00Z' }),
    ])
    expect(info.stageByLeadId.get('l1')).toBe('recente')
  })

  it('deals undefined nao quebra', () => {
    const info = buildActiveDealInfo(undefined)
    expect(info.activeLeadIds.size).toBe(0)
  })
})
