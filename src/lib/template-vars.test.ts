import { describe, it, expect } from 'vitest'
import { extractTemplateVars } from '@/lib/template-vars'

describe('extractTemplateVars', () => {
  it('extrai variaveis unicas ordenadas', () => {
    expect(extractTemplateVars('Ola {{1}}, seu pedido {{2}}')).toEqual([1, 2])
  })

  it('texto sem variavel retorna vazio', () => {
    expect(extractTemplateVars('Mensagem fixa sem variaveis')).toEqual([])
  })

  it('conta {{1}} repetido uma unica vez', () => {
    expect(extractTemplateVars('{{1}} e de novo {{1}}')).toEqual([1])
  })

  it('ordena mesmo fora de ordem', () => {
    expect(extractTemplateVars('{{3}} {{1}} {{2}}')).toEqual([1, 2, 3])
  })

  it('{{2}} sem {{1}} vem como [2] (buraco detectavel pelo chamador)', () => {
    expect(extractTemplateVars('Oi {{2}}')).toEqual([2])
  })

  it('ignora chaves nao numericas', () => {
    expect(extractTemplateVars('{{nome}} {{1}}')).toEqual([1])
  })

  it('string vazia retorna vazio', () => {
    expect(extractTemplateVars('')).toEqual([])
  })
})
