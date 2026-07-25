import { describe, it, expect } from 'vitest'
import { PASSWORD_RULES, passwordSchema } from '@/lib/password-rules'

const ruleById = (id: string) => {
  const rule = PASSWORD_RULES.find((r) => r.id === id)
  if (!rule) throw new Error(`Regra ${id} nao encontrada`)
  return rule
}

describe('PASSWORD_RULES', () => {
  it('tem exatamente as 4 regras de hoje, sem inventar', () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      'min-length',
      'uppercase',
      'lowercase',
      'digit',
    ])
  })

  describe('min-length', () => {
    const { test } = ruleById('min-length')

    it('8 caracteres passa (borda)', () => {
      expect(test('12345678')).toBe(true)
    })

    it('7 caracteres nao passa (borda)', () => {
      expect(test('1234567')).toBe(false)
    })

    it('vazio nao passa', () => {
      expect(test('')).toBe(false)
    })
  })

  describe('uppercase', () => {
    const { test } = ruleById('uppercase')

    it('com maiuscula passa', () => {
      expect(test('senhA')).toBe(true)
    })

    it('so minusculas nao passa', () => {
      expect(test('senha')).toBe(false)
    })
  })

  describe('lowercase', () => {
    const { test } = ruleById('lowercase')

    it('com minuscula passa', () => {
      expect(test('SENHa')).toBe(true)
    })

    it('so maiusculas nao passa', () => {
      expect(test('SENHA')).toBe(false)
    })
  })

  describe('digit', () => {
    const { test } = ruleById('digit')

    it('com numero passa', () => {
      expect(test('senha1')).toBe(true)
    })

    it('sem numero nao passa', () => {
      expect(test('senha')).toBe(false)
    })
  })
})

describe('passwordSchema', () => {
  it('senha que cumpre as 4 regras passa', () => {
    expect(passwordSchema.safeParse('Senha123').success).toBe(true)
  })

  it('acumula TODAS as falhas, nao para na primeira', () => {
    // 'abc' falha em min-length, uppercase e digit de uma vez
    const result = passwordSchema.safeParse('abc')
    expect(result.success).toBe(false)
    if (result.success) return
    const messages = result.error.issues.map((i) => i.message)
    expect(messages).toContain('A senha deve ter no mínimo 8 caracteres')
    expect(messages).toContain('A senha deve ter pelo menos uma letra maiúscula')
    expect(messages).toContain('A senha deve ter pelo menos um número')
    expect(messages).not.toContain('A senha deve ter pelo menos uma letra minúscula')
  })

  it('as mensagens do schema sao exatamente os labels das regras', () => {
    const result = passwordSchema.safeParse('')
    if (result.success) throw new Error('esperava falha')
    const messages = result.error.issues.map((i) => i.message).sort()
    const labels = PASSWORD_RULES.map((r) => r.label).sort()
    expect(messages).toEqual(labels)
  })
})
