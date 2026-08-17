import { describe, it, expect } from 'vitest'
import { fetchAllRows, onlyInPipeline } from './dashboard.service'

interface Row {
  id: string
}

const makeRows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))

/**
 * Servidor falso. `serverCap` e quantas linhas ele devolve no maximo por
 * resposta, independente do intervalo pedido: e assim que o PostgREST se
 * comporta com `max_rows`.
 */
const makeSource = (rows: Row[], serverCap = Infinity) => {
  const calls: { from: number; to: number }[] = []
  const query = (from: number, to: number) => {
    calls.push({ from, to })
    const size = Math.min(to - from + 1, serverCap)
    return Promise.resolve({ data: rows.slice(from, from + size), error: null })
  }
  return { query, calls }
}

describe('fetchAllRows', () => {
  it('monta o conjunto completo quando o servidor devolve MENOS que o pedido', async () => {
    // O caso que justifica o helper: teto do servidor (7) abaixo do PAGE (1000).
    // Se alguem trocar `from += rows.length` por `from += PAGE`, a segunda
    // chamada pula para 1000, volta vazia, e o resultado cai de 20 para 7.
    const rows = makeRows(20)
    const { query, calls } = makeSource(rows, 7)

    const result = await fetchAllRows(query)

    expect(result.map((r) => r.id)).toEqual(rows.map((r) => r.id))
    expect(calls[0].from).toBe(0)
    expect(calls[1].from).toBe(7)
    expect(calls[2].from).toBe(14)
  })

  it('nao para na pagina curta, so quando a resposta volta vazia', async () => {
    // Parar em `rows.length < PAGE` seria o bug: pagina curta e teto do
    // servidor sao indistinguiveis daqui. Por isso a chamada final vazia e
    // obrigatoria, nao desperdicio.
    const { query, calls } = makeSource(makeRows(20))

    const result = await fetchAllRows(query)

    expect(result).toHaveLength(20)
    expect(calls).toHaveLength(2)
  })

  it('atravessa o multiplo exato do teto do servidor', async () => {
    const { query, calls } = makeSource(makeRows(14), 7)

    const result = await fetchAllRows(query)

    expect(result).toHaveLength(14)
    expect(calls).toHaveLength(3)
  })

  it('conjunto vazio: devolve [] com exatamente uma chamada, sem laco', async () => {
    const { query, calls } = makeSource([])

    const result = await fetchAllRows(query)

    expect(result).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('propaga o erro e para na primeira chamada', async () => {
    const calls: number[] = []
    const query = (from: number) => {
      calls.push(from)
      return Promise.resolve({ data: null, error: new Error('falha na consulta') })
    }

    await expect(fetchAllRows(query)).rejects.toThrow('falha na consulta')
    expect(calls).toHaveLength(1)
  })
})

describe('onlyInPipeline', () => {
  const rows = makeRows(3)

  it('com Set, mantem so os contatos que tem negocio no pipeline', () => {
    expect(onlyInPipeline(rows, new Set(['r0', 'r2'])).map((r) => r.id)).toEqual(['r0', 'r2'])
  })

  it('com null, devolve tudo: sem recorte de pipeline o contato sem negocio continua contando', () => {
    expect(onlyInPipeline(rows, null)).toHaveLength(3)
  })

  it('trata data nula como conjunto vazio', () => {
    expect(onlyInPipeline(null, new Set(['r0']))).toEqual([])
  })
})
