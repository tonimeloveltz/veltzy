import { describe, it, expect } from 'vitest'
import { isValidPhoneBR, formatPhoneBR } from '@/lib/phone'

describe('isValidPhoneBR', () => {
  it('celular valido (so digitos)', () => {
    expect(isValidPhoneBR('11917162109')).toBe(true)
  })

  it('celular valido com mascara', () => {
    expect(isValidPhoneBR('(11) 91716-2109')).toBe(true)
  })

  it('celular valido com 55', () => {
    expect(isValidPhoneBR('5511917162109')).toBe(true)
  })

  it('fixo valido (8 digitos, comeca em 3)', () => {
    expect(isValidPhoneBR('1133334444')).toBe(true)
  })

  it('fixo valido com 55', () => {
    expect(isValidPhoneBR('551133334444')).toBe(true)
  })

  it('fixo valido comecando em 2, 4 e 5', () => {
    expect(isValidPhoneBR('1122223333')).toBe(true)
    expect(isValidPhoneBR('1144445555')).toBe(true)
    expect(isValidPhoneBR('1155556666')).toBe(true)
  })

  it('DDD inexistente e rejeitado (faixa aberta 11-99 nao serve)', () => {
    expect(isValidPhoneBR('23917162109')).toBe(false)
    expect(isValidPhoneBR('20917162109')).toBe(false)
    expect(isValidPhoneBR('52917162109')).toBe(false)
    expect(isValidPhoneBR('90917162109')).toBe(false)
  })

  it('celular sem o 9 e invalido', () => {
    expect(isValidPhoneBR('1181716210')).toBe(false)
  })

  it('fixo comecando fora de 2-5 e invalido', () => {
    expect(isValidPhoneBR('1113334444')).toBe(false)
    expect(isValidPhoneBR('1163334444')).toBe(false)
    expect(isValidPhoneBR('1193334444')).toBe(false)
  })

  it('menos digitos e invalido', () => {
    expect(isValidPhoneBR('119171')).toBe(false)
  })

  it('mais digitos (12 sem 55) e invalido', () => {
    expect(isValidPhoneBR('119171621099')).toBe(false)
  })

  it('com e sem 55 sao equivalentes', () => {
    expect(isValidPhoneBR('11917162109')).toBe(isValidPhoneBR('5511917162109'))
    expect(isValidPhoneBR('11917162109')).toBe(true)
  })

  it('string vazia e invalida', () => {
    expect(isValidPhoneBR('')).toBe(false)
  })

  it('so simbolos e invalido', () => {
    expect(isValidPhoneBR('(  ) -')).toBe(false)
  })

  it('numero torto: digitos validos passam, invalidos nao', () => {
    // letras no meio sao removidas; sobra 11917162109 -> valido
    expect(isValidPhoneBR('11abc917162109')).toBe(true)
    // letras removidas deixam numero incompleto -> invalido
    expect(isValidPhoneBR('11abc9171')).toBe(false)
  })
})

describe('formatPhoneBR', () => {
  it('celular completo', () => {
    expect(formatPhoneBR('11917162109')).toBe('(11) 91716-2109')
  })

  it('fixo completo', () => {
    expect(formatPhoneBR('1133334444')).toBe('(11) 3333-4444')
  })

  it('remove o 55 do inicio', () => {
    expect(formatPhoneBR('5511917162109')).toBe('(11) 91716-2109')
  })

  it('parciais durante a digitacao', () => {
    expect(formatPhoneBR('1')).toBe('(1')
    expect(formatPhoneBR('11')).toBe('(11')
    expect(formatPhoneBR('119')).toBe('(11) 9')
    expect(formatPhoneBR('119171')).toBe('(11) 9171')
    expect(formatPhoneBR('1191716')).toBe('(11) 9171-6')
  })

  it('vazio devolve string vazia', () => {
    expect(formatPhoneBR('')).toBe('')
  })

  it('excesso e cortado em 11 digitos', () => {
    expect(formatPhoneBR('119171621099999')).toBe('(11) 91716-2109')
  })

  it('nao lanca para lixo', () => {
    expect(formatPhoneBR('abc')).toBe('')
    expect(formatPhoneBR('(11) 9')).toBe('(11) 9')
  })
})
