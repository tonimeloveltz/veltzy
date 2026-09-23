import { describe, it, expect } from 'vitest'
import { getTemplateBody, extractVariables } from './template-render'

describe('getTemplateBody', () => {
  it('pega o BODY e ignora HEADER/FOOTER', () => {
    expect(getTemplateBody([
      { type: 'HEADER', text: 'oi' },
      { type: 'BODY', text: 'Ola {{1}}' },
      { type: 'FOOTER', text: 'rodape' },
    ])).toBe('Ola {{1}}')
  })
  it('case-insensitive; vazio se sem BODY ou entrada invalida', () => {
    expect(getTemplateBody([{ type: 'body', text: 'x' }])).toBe('x')
    expect(getTemplateBody([{ type: 'HEADER', text: 'x' }])).toBe('')
    expect(getTemplateBody(null)).toBe('')
    expect(getTemplateBody(undefined)).toBe('')
  })
})

describe('extractVariables', () => {
  it('retorna indices unicos em ordem crescente', () => {
    expect(extractVariables('Ola {{1}}, {{2}} e de novo {{1}}')).toEqual(['1', '2'])
  })
  it('tolera espacos e sem variaveis', () => {
    expect(extractVariables('Oi {{ 3 }} e {{1}}')).toEqual(['1', '3'])
    expect(extractVariables('sem variaveis')).toEqual([])
  })
})
