import { describe, it, expect } from 'vitest'
import { allVariantsReady, buildMessageVariants, extractNamedVariables, validateVariant, variantProblem } from './campaign-variants'

const ORIG = 'Oi {{nome}}, tudo bem? Temos uma oferta para a {{empresa}}.'

describe('campaign-variants (client)', () => {
  it('extrai variaveis unicas, minusculas, ordenadas', () => {
    expect(extractNamedVariables('{{ Nome }} e {{empresa}} e {{nome}}')).toEqual(['empresa', 'nome'])
  })

  it('valida versao ok', () => {
    expect(validateVariant(ORIG, 'Ola {{NOME}}! Separamos algo para a {{empresa}}.')).toEqual({ ok: true })
  })

  it('perdeu variavel', () => {
    const r = validateVariant(ORIG, 'Ola {{nome}}! Temos uma oferta.')
    expect(r).toEqual({ ok: false, reason: 'missing_vars', vars: ['empresa'] })
    expect(variantProblem(r)).toBe('Esta versão precisa ter {{empresa}}.')
  })

  it('inventou variavel', () => {
    const r = validateVariant(ORIG, 'Ola {{nome}} de {{cidade}}, oferta para a {{empresa}}.')
    expect(r).toEqual({ ok: false, reason: 'extra_vars', vars: ['cidade'] })
    expect(variantProblem(r)).toBe('{{cidade}} não existe na mensagem original.')
  })

  it('vazio e duplicada', () => {
    expect(validateVariant(ORIG, '  ')).toEqual({ ok: false, reason: 'empty' })
    expect(validateVariant(ORIG, ` ${ORIG.toLowerCase()} `)).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('allVariantsReady exige todas aprovadas e validas', () => {
    const ok = 'Ola {{nome}}! Separamos algo para a {{empresa}}.'
    expect(allVariantsReady(ORIG, [{ text: ok, status: 'approved' }])).toBe(true)
    expect(allVariantsReady(ORIG, [{ text: ok, status: 'pending' }])).toBe(false)
    expect(allVariantsReady(ORIG, [{ text: 'Ola {{nome}}', status: 'approved' }])).toBe(false)
    expect(allVariantsReady(ORIG, [{ text: ok, status: 'approved' }, { text: ok, status: 'approved' }])).toBe(false)
  })

  it('buildMessageVariants: original primeiro; sem versoes = null', () => {
    expect(buildMessageVariants(` ${ORIG} `, [{ text: ' v1 ', status: 'approved' }])).toEqual([ORIG, 'v1'])
    expect(buildMessageVariants(ORIG, [])).toBeNull()
  })
})
