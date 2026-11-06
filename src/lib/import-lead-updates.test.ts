import { describe, it, expect } from 'vitest'
import { isPlaceholderName, buildLeadUpdateSuggestion } from './import-lead-updates'

describe('isPlaceholderName', () => {
  it('trata nulo, vazio e só dígitos como sem nome', () => {
    expect(isPlaceholderName(null)).toBe(true)
    expect(isPlaceholderName('')).toBe(true)
    expect(isPlaceholderName('   ')).toBe(true)
    expect(isPlaceholderName('5511999998888')).toBe(true)
    expect(isPlaceholderName('+55 (11) 99999-8888')).toBe(true)
  })
  it('nome real não é placeholder', () => {
    expect(isPlaceholderName('Thiago')).toBe(false)
    expect(isPlaceholderName('Loja 123')).toBe(false)
  })
})

describe('buildLeadUpdateSuggestion', () => {
  const phone = '5511999998888'

  it('completa nome sem sobrenome via name', () => {
    const s = buildLeadUpdateSuggestion({ id: 'a', name: null, email: null }, { name: ' Thiago  Pacheco ' }, 0, phone)
    expect(s?.fields).toEqual({ name: 'Thiago Pacheco' })
    expect(s?.newName).toBe('Thiago Pacheco')
  })

  it('completa nome com sobrenome via first/last', () => {
    const s = buildLeadUpdateSuggestion({ id: 'a', name: phone, email: null }, { name: 'Thiago', last_name: 'Pacheco' }, 3, phone)
    expect(s?.fields).toEqual({ first_name: 'Thiago', last_name: 'Pacheco' })
    expect(s?.newName).toBe('Thiago Pacheco')
    expect(s?.rowIndex).toBe(3)
  })

  it('nunca sobrescreve nome real', () => {
    const s = buildLeadUpdateSuggestion({ id: 'a', name: 'Thiago', email: 'x@y.com' }, { name: 'Outro' }, 0, phone)
    expect(s).toBeNull()
  })

  it('completa só o email quando o nome já existe', () => {
    const s = buildLeadUpdateSuggestion({ id: 'a', name: 'Thiago', email: null }, { name: 'Outro', email: 't@p.com' }, 0, phone)
    expect(s?.fields).toEqual({ email: 't@p.com' })
    expect(s?.newName).toBeUndefined()
  })

  it('não sobrescreve email preenchido', () => {
    const s = buildLeadUpdateSuggestion({ id: 'a', name: null, email: 'x@y.com' }, { name: 'Thiago', email: 't@p.com' }, 0, phone)
    expect(s?.fields).toEqual({ name: 'Thiago' })
  })

  it('null quando a planilha também não tem nada', () => {
    expect(buildLeadUpdateSuggestion({ id: 'a', name: null, email: null }, {}, 0, phone)).toBeNull()
  })
})
