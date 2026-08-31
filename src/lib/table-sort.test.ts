import { describe, it, expect } from 'vitest'
import { sortRows } from './table-sort'
import type { SortValue } from './table-sort'

/** Linha minima: so o valor que a celula mostraria, mais um id para conferir estabilidade. */
interface Row {
  id: string
  value: SortValue
}

const rows = (...values: SortValue[]): Row[] =>
  values.map((value, i) => ({ id: `r${i}`, value }))

const values = (result: Row[]) => result.map((r) => r.value)

const byValue = (row: Row) => row.value

describe('sortRows', () => {
  it('asc e desc invertem a ordem dos valores preenchidos', () => {
    const input = rows('banana', 'abacaxi', 'caju')
    expect(values(sortRows(input, byValue, 'asc'))).toEqual(['abacaxi', 'banana', 'caju'])
    expect(values(sortRows(input, byValue, 'desc'))).toEqual(['caju', 'banana', 'abacaxi'])
  })

  it('vazio (null, undefined, string vazia) fica por ultimo em asc E em desc', () => {
    const input = rows('banana', null, 'abacaxi', undefined, '')
    const asc = values(sortRows(input, byValue, 'asc'))
    const desc = values(sortRows(input, byValue, 'desc'))

    expect(asc.slice(0, 2)).toEqual(['abacaxi', 'banana'])
    expect(asc.slice(2).every((v) => v == null || v === '')).toBe(true)

    // Inverter a direcao NAO pode trazer os vazios para o topo.
    expect(desc.slice(0, 2)).toEqual(['banana', 'abacaxi'])
    expect(desc.slice(2).every((v) => v == null || v === '')).toBe(true)
  })

  it('0 ordena como numero, nao como vazio', () => {
    const input = rows(0, 5, null)
    expect(values(sortRows(input, byValue, 'asc'))).toEqual([0, 5, null])
    // Em desc o 0 continua sendo valor: vem depois do 5 e antes do vazio.
    expect(values(sortRows(input, byValue, 'desc'))).toEqual([5, 0, null])
  })

  it('texto ignora acento e caixa', () => {
    const input = rows('ávila', 'Banana', 'Ana')
    expect(values(sortRows(input, byValue, 'asc'))).toEqual(['Ana', 'ávila', 'Banana'])
  })

  it('composto com numero ordena 2 antes de 10', () => {
    const input = rows('Vendas 10', 'Vendas 2')
    expect(values(sortRows(input, byValue, 'asc'))).toEqual(['Vendas 2', 'Vendas 10'])
  })

  it('empate preserva a ordem de entrada', () => {
    const input: Row[] = [
      { id: 'primeiro', value: 'igual' },
      { id: 'segundo', value: 'igual' },
      { id: 'terceiro', value: 'igual' },
    ]
    expect(sortRows(input, byValue, 'asc').map((r) => r.id)).toEqual(['primeiro', 'segundo', 'terceiro'])
    expect(sortRows(input, byValue, 'desc').map((r) => r.id)).toEqual(['primeiro', 'segundo', 'terceiro'])
  })

  it('nao muta o array recebido', () => {
    const input = rows('banana', 'abacaxi')
    const snapshot = [...input]

    sortRows(input, byValue, 'asc')

    expect(input).toEqual(snapshot)
    expect(input[0]).toBe(snapshot[0])
  })
})
