import { describe, it, expect } from 'vitest'
import { leadGreetingName } from './lead-name'

describe('leadGreetingName', () => {
  it('usa first_name', () => {
    expect(leadGreetingName({ first_name: 'Maria', name: 'Maria Souza' })).toBe('Maria')
  })
  it('sem first_name: 1a palavra do name', () => {
    expect(leadGreetingName({ first_name: null, name: '  Joao   da Silva ' })).toBe('Joao')
  })
  it('placeholder e telefone viram vazio', () => {
    expect(leadGreetingName({ name: 'Contato 1234' })).toBe('')
    expect(leadGreetingName({ name: '+55 (11) 99999-9999' })).toBe('')
    expect(leadGreetingName({ name: '' })).toBe('')
    expect(leadGreetingName(null)).toBe('')
  })
})
