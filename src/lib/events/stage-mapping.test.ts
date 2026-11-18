import { describe, expect, it } from 'vitest'
import { autoMapStages } from './stage-mapping'

describe('autoMapStages', () => {
  it('casa as etapas do pipeline de evento pelo slug', () => {
    expect(autoMapStages([
      { id: 'd', slug: 'nao-compareceu', position: 3 }, { id: 'a', slug: 'inscrito', position: 0 },
      { id: 'b', slug: 'confirmado', position: 1 }, { id: 'c', slug: 'presente', position: 2 },
    ])).toEqual({ entry_stage_id: 'a', confirmed_stage_id: 'b', present_stage_id: 'c', absent_stage_id: 'd' })
  })

  it('pipeline comum: entrada na primeira etapa, o resto vazio', () => {
    expect(autoMapStages([{ id: 'y', slug: 'proposta', position: 1 }, { id: 'x', slug: 'novo', position: 0 }]))
      .toEqual({ entry_stage_id: 'x', confirmed_stage_id: '', present_stage_id: '', absent_stage_id: '' })
  })

  it('sem etapas, tudo vazio', () => {
    expect(autoMapStages([]).entry_stage_id).toBe('')
  })
})
