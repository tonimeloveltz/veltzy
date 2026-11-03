import { describe, it, expect } from 'vitest'
import { EXPORT_HEADERS, TEMPLATE_HEADERS, TEMPLATE_EXAMPLE, exportNameColumns } from './export-leads'
import { autoMapColumns } from './csv-parser'

describe('export-leads: nome e sobrenome', () => {
  it('headers: Nome, Sobrenome, Nome completo no inicio', () => {
    expect(EXPORT_HEADERS.slice(0, 4)).toEqual(['Nome', 'Sobrenome', 'Nome completo', 'Telefone'])
  })

  it('Nome = first_name, Sobrenome = last_name, Nome completo = name', () => {
    expect(exportNameColumns({ name: 'Maria Aparecida Souza', first_name: 'Maria', last_name: 'Aparecida Souza' }))
      .toEqual(['Maria', 'Aparecida Souza', 'Maria Aparecida Souza'])
  })

  it('placeholder sem first_name: Nome cai no name, Sobrenome vazio', () => {
    expect(exportNameColumns({ name: 'Contato 1234', first_name: null, last_name: null }))
      .toEqual(['Contato 1234', '', 'Contato 1234'])
  })

  it('objeto sem a coluna first_name: nao duplica o sobrenome', () => {
    expect(exportNameColumns({ name: 'Maria Souza' } as never)).toEqual(['Maria Souza', '', 'Maria Souza'])
  })

  it('template: Sobrenome logo apos Nome, exemplo alinhado', () => {
    expect(TEMPLATE_HEADERS.slice(0, 2)).toEqual(['Nome', 'Sobrenome'])
    expect(TEMPLATE_EXAMPLE).toHaveLength(TEMPLATE_HEADERS.length)
  })

  it('reimportar o export: Nome→name, Sobrenome→last_name, Nome completo ignorado', () => {
    const mapping = autoMapColumns(EXPORT_HEADERS)
    expect(mapping[0]).toBe('name')
    expect(mapping[1]).toBe('last_name')
    expect(mapping[2]).toBeNull()
    expect(mapping[3]).toBe('phone')
  })

  it('template reimporta com Sobrenome', () => {
    const mapping = autoMapColumns(TEMPLATE_HEADERS)
    expect(mapping[0]).toBe('name')
    expect(mapping[1]).toBe('last_name')
  })
})
