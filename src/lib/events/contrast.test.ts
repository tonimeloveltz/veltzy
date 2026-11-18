import { describe, expect, it } from 'vitest'
import { contrastRatio, lowContrast, THEME_TEXT } from './contrast'

describe('contrast', () => {
  it('preto no branco e 21:1, igual e 1:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('a ordem das cores nao importa', () => {
    expect(contrastRatio('#0E7490', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#0E7490')!, 10)
  })

  it('padrao do evento passa; amarelo com branco nao', () => {
    expect(lowContrast('#FFFFFF', '#0E7490')).toBe(false)
    expect(lowContrast('#FFFFFF', '#FACC15')).toBe(true)
    expect(lowContrast(THEME_TEXT.light, '#F8FAFC')).toBe(false)
    expect(lowContrast(THEME_TEXT.dark, '#F8FAFC')).toBe(true)
  })

  it('cor invalida nao gera aviso', () => {
    expect(contrastRatio('red', '#FFFFFF')).toBeNull()
    expect(lowContrast('#FFF', '#000000')).toBe(false)
  })
})
