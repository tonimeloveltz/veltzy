import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fila de respostas: cada .maybeSingle()/.single() consome a proxima.
let responseQueue: Array<{ data: unknown; error: unknown }> = []
// Captura o ultimo update aplicado (payload + filtros) para assercoes.
let lastUpdate: { payload: Record<string, unknown>; eqs: Array<[string, unknown]> } | null = null

function createChainable() {
  const state: { eqs: Array<[string, unknown]> } = { eqs: [] }
  const self: Record<string, unknown> = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => responseQueue.shift() ?? { data: null, error: null }
      }
      // Torna a cadeia awaitable (update sem .single() e aguardado direto).
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) =>
          resolve(responseQueue.shift() ?? { data: null, error: null })
      }
      if (prop === 'update') {
        return (payload: Record<string, unknown>) => {
          state.eqs = []
          lastUpdate = { payload, eqs: state.eqs }
          return self
        }
      }
      if (prop === 'eq') {
        return (col: string, val: unknown) => { state.eqs.push([col, val]); return self }
      }
      // from/select/order/etc encadeiam retornando self.
      return () => self
    },
  })
  return self
}

vi.mock('@/lib/supabase', () => {
  const chainable = createChainable()
  return { supabase: chainable, veltzy: () => chainable }
})

import { getRoutingRuleByOrigin, reassignRoutingRule } from './pipeline-routing-rules.service'

describe('getRoutingRuleByOrigin', () => {
  beforeEach(() => {
    responseQueue = []
    lastUpdate = null
  })

  it('retorna a regra com o nome do funil (embed) quando existe', async () => {
    responseQueue = [
      { data: { id: 'rule-1', pipeline_id: 'pipe-A', pipelines: { name: 'MP Rio do Sul' } }, error: null },
    ]
    const result = await getRoutingRuleByOrigin('company-1', 'instance', 'veltz-group')
    expect(result).toEqual({ id: 'rule-1', pipeline_id: 'pipe-A', pipelineName: 'MP Rio do Sul' })
  })

  it('normaliza o embed quando o PostgREST devolve o funil como array', async () => {
    responseQueue = [
      { data: { id: 'rule-3', pipeline_id: 'pipe-C', pipelines: [{ name: 'Pipeline Principal' }] }, error: null },
    ]
    const result = await getRoutingRuleByOrigin('company-1', 'instance', 'veltz-group')
    expect(result).toEqual({ id: 'rule-3', pipeline_id: 'pipe-C', pipelineName: 'Pipeline Principal' })
  })

  it('retorna null quando nao ha regra para a origem', async () => {
    responseQueue = [{ data: null, error: null }]
    const result = await getRoutingRuleByOrigin('company-1', 'instance', 'nao-existe')
    expect(result).toBeNull()
  })

  it('normaliza pipelineName para string vazia quando o embed nao resolve', async () => {
    responseQueue = [
      { data: { id: 'rule-2', pipeline_id: 'pipe-B', pipelines: null }, error: null },
    ]
    const result = await getRoutingRuleByOrigin('company-1', 'webhook_source', 'src-1')
    expect(result).toEqual({ id: 'rule-2', pipeline_id: 'pipe-B', pipelineName: '' })
  })

  it('propaga erro do banco', async () => {
    responseQueue = [{ data: null, error: { message: 'boom' } }]
    await expect(getRoutingRuleByOrigin('company-1', 'instance', 'x')).rejects.toBeTruthy()
  })
})

describe('reassignRoutingRule', () => {
  beforeEach(() => {
    responseQueue = []
    lastUpdate = null
  })

  it('move a regra para o funil de destino e reativa (is_active=true), filtrando por id+empresa', async () => {
    await reassignRoutingRule('company-1', 'rule-1', 'pipe-destino')
    expect(lastUpdate?.payload).toEqual({ pipeline_id: 'pipe-destino', is_active: true })
    expect(lastUpdate?.eqs).toEqual(
      expect.arrayContaining([['id', 'rule-1'], ['company_id', 'company-1']]),
    )
  })
})
