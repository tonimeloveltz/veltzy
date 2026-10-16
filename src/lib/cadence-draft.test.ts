import { describe, it, expect } from 'vitest'
import { parseConditions, parseRecurringCron } from './cadence-draft'

describe('parseConditions', () => {
  it('reconstrói os campos do form a partir das condições gravadas', () => {
    expect(parseConditions([
      { field: 'to_stage_id', operator: 'in', value: ['s1', 's2'] },
      { field: 'tag', operator: 'eq', value: 'vip' },
      { field: 'source_id', operator: 'eq', value: 'src' },
      { field: 'stage_id', operator: 'in', value: ['s3'] },
    ])).toEqual({ stageTargets: ['s1', 's2'], tagName: 'vip', sourceId: 'src', onlyStageIds: ['s3'] })
  })

  it('ignora condições desconhecidas e aceita nulo', () => {
    expect(parseConditions(null)).toEqual({ stageTargets: [], tagName: '', sourceId: '', onlyStageIds: [] })
    expect(parseConditions([{ field: 'x', operator: 'eq', value: 1 }]).tagName).toBe('')
  })
})

describe('parseRecurringCron', () => {
  it('lê os três presets', () => {
    expect(parseRecurringCron('daily@08:30')).toEqual({ freq: 'daily', time: '08:30', dow: 1, dom: 1 })
    expect(parseRecurringCron('weekly@5@10:00')).toEqual({ freq: 'weekly', time: '10:00', dow: 5, dom: 1 })
    expect(parseRecurringCron('monthly@15@18:00')).toEqual({ freq: 'monthly', time: '18:00', dow: 1, dom: 15 })
  })

  it('cai no padrão com valor nulo ou inválido', () => {
    expect(parseRecurringCron(null).freq).toBe('daily')
    expect(parseRecurringCron('lixo').time).toBe('09:00')
  })
})
