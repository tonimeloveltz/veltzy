import { describe, expect, it } from 'vitest'
import { PALETTE } from '@/components/shared/color-picker'
import {
  TAG_SURFACES, TAG_TEXT_DARK, TAG_TEXT_LIGHT, compositeTagBackground, contrastRatio,
  getReadableTextColor, getTagStyleVars, getTagTextColor, isValidTagColor, normalizeTagKey,
} from './tag-colors'

const luminance = (hex: string) => {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('getReadableTextColor', () => {
  it('texto escuro em cor clara e claro em cor escura', () => {
    expect(getReadableTextColor('#FFFF00')).toBe(TAG_TEXT_DARK)
    expect(getReadableTextColor('#111111')).toBe(TAG_TEXT_LIGHT)
  })

  it('toda cor da paleta fica com contraste >= 3 (texto grande/negrito WCAG)', () => {
    for (const color of PALETTE) {
      expect(contrast(color, getReadableTextColor(color))).toBeGreaterThanOrEqual(3)
    }
  })

  it('hex invalido cai no texto escuro sem quebrar', () => {
    expect(getReadableTextColor('vermelho')).toBe(TAG_TEXT_DARK)
  })
})

describe('isValidTagColor / normalizeTagKey', () => {
  it('aceita so #RRGGBB, igual ao CHECK da tabela', () => {
    expect(isValidTagColor('#3b82f6')).toBe(true)
    expect(isValidTagColor('#3B82F6')).toBe(true)
    expect(isValidTagColor('#fff')).toBe(false)
    expect(isValidTagColor('3b82f6')).toBe(false)
  })

  it('casa nome sem diferenciar caixa nem espaco nas pontas', () => {
    expect(normalizeTagKey('  VIP ')).toBe(normalizeTagKey('vip'))
  })
})

describe('badge suave (getTagStyleVars / getTagTextColor)', () => {
  const modes = ['light', 'dark'] as const

  it.each(PALETTE)('%s: texto AA sobre o fundo composto em todas as superficies, nos dois modos', (hex) => {
    for (const mode of modes) {
      const fg = getTagTextColor(hex, mode)
      for (const surface of TAG_SURFACES[mode]) {
        const bg = compositeTagBackground(hex, surface, mode)
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('texto e a propria cor escurecida no claro e clareada no escuro', () => {
    const hex = '#3b82f6'
    expect(luminance(getTagTextColor(hex, 'light'))).toBeLessThan(luminance(hex))
    expect(luminance(getTagTextColor(hex, 'dark'))).toBeGreaterThan(luminance(hex))
  })

  it('cor que ja passa AA nao e alterada', () => {
    // azul bem escuro sobre o fundo 12% claro ja tem contraste de sobra
    expect(getTagTextColor('#1e3a8a', 'light')).toBe('#1e3a8a')
  })

  it('fundo translucido: 12% no claro, 20% no escuro, sem borda', () => {
    const vars = getTagStyleVars('#ef4444')
    expect(vars['--tag-bg']).toBe('rgb(239 68 68 / 0.12)')
    expect(vars['--tag-bg-dark']).toBe('rgb(239 68 68 / 0.2)')
    expect(Object.keys(vars).some((k) => k.includes('border'))).toBe(false)
  })

  it('cores extremas (amarelo, branco, preto) ainda passam AA', () => {
    for (const hex of ['#ffff00', '#ffffff', '#000000']) {
      for (const mode of modes) {
        const fg = getTagTextColor(hex, mode)
        for (const surface of TAG_SURFACES[mode]) {
          expect(contrastRatio(fg, compositeTagBackground(hex, surface, mode))).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
