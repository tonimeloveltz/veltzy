import { describe, expect, it } from 'vitest'
import { PALETTE } from '@/components/shared/color-picker'
import { TAG_TEXT_DARK, TAG_TEXT_LIGHT, getReadableTextColor, isValidTagColor, normalizeTagKey } from './tag-colors'

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
