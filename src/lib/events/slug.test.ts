import { describe, it, expect } from 'vitest'
import { draftSlug, isValidSlug, slugify } from './slug'

describe('slugify', () => {
  it('tira acento, pontuacao e espacos', () => {
    expect(slugify('Encontro de Gestão 2026: São Paulo!')).toBe('encontro-de-gestao-2026-sao-paulo')
  })
  it('colapsa hifens e corta sem deixar hifen no fim', () => {
    expect(slugify('a -- b')).toBe('a-b')
    expect(slugify('abc def', 4)).toBe('abc')
  })
  it('texto sem letra vira vazio', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('isValidSlug', () => {
  it('aceita o formato do CHECK do banco', () => {
    expect(isValidSlug('meu-evento-2026')).toBe(true)
  })
  it('recusa curto, reservado, maiuscula e hifen nas pontas', () => {
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('admin')).toBe(false)
    expect(isValidSlug('Meu-evento')).toBe(false)
    expect(isValidSlug('-evento')).toBe(false)
    expect(isValidSlug('evento-')).toBe(false)
  })
})

describe('draftSlug', () => {
  it('gera slug valido a partir do titulo', () => {
    const s = draftSlug('Novo evento')
    expect(s).toMatch(/^novo-evento-[a-z0-9]{6}$/)
    expect(isValidSlug(s)).toBe(true)
  })
  it('titulo vazio cai em "evento"', () => {
    expect(draftSlug('')).toMatch(/^evento-[a-z0-9]{6}$/)
  })
})
