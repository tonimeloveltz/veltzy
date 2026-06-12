import { describe, it, expect } from 'vitest'
import { tagColor } from './tag-colors'

describe('tagColor', () => {
  it('retorna bg e text para qualquer string', () => {
    const result = tagColor('vip')
    expect(result.bg).toBeTruthy()
    expect(result.text).toBeTruthy()
  })

  it('mesma tag retorna mesma cor (deterministico)', () => {
    const a = tagColor('urgente')
    const b = tagColor('urgente')
    expect(a).toEqual(b)
  })

  it('case-insensitive: "VIP" e "vip" retornam mesma cor', () => {
    expect(tagColor('VIP')).toEqual(tagColor('vip'))
  })

  it('tags diferentes podem ter cores diferentes', () => {
    const colors = new Set(
      ['vip', 'urgente', 'frio', 'quente', 'retorno', 'demo', 'trial', 'enterprise']
        .map((t) => tagColor(t).bg)
    )
    // Com 8 tags e 8 cores na paleta, deve ter pelo menos 3 diferentes
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })
})
