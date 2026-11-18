import { describe, expect, it } from 'vitest'
import { fromZonedInput, toZonedInput } from './zoned-time'

const SP = 'America/Sao_Paulo'

describe('zoned-time', () => {
  it('converte ISO para o relogio de Sao Paulo', () => {
    expect(toZonedInput('2026-11-24T12:00:00.000Z', SP)).toBe('2026-11-24T09:00')
  })

  it('converte o relogio de Sao Paulo para ISO UTC', () => {
    expect(fromZonedInput('2026-11-24T09:00', SP)).toBe('2026-11-24T12:00:00.000Z')
  })

  it('ida e volta preservam o instante, inclusive na virada do dia', () => {
    const iso = '2026-11-25T02:30:00.000Z'
    expect(toZonedInput(iso, SP)).toBe('2026-11-24T23:30')
    expect(fromZonedInput(toZonedInput(iso, SP), SP)).toBe(iso)
  })

  it('respeita outro fuso', () => {
    expect(fromZonedInput('2026-07-01T09:00', 'Europe/Lisbon')).toBe('2026-07-01T08:00:00.000Z')
    expect(toZonedInput('2026-07-01T08:00:00.000Z', 'Europe/Lisbon')).toBe('2026-07-01T09:00')
  })

  it('vazio e invalido viram vazio/nulo', () => {
    expect(toZonedInput(null, SP)).toBe('')
    expect(toZonedInput('lixo', SP)).toBe('')
    expect(fromZonedInput('', SP)).toBeNull()
    expect(fromZonedInput('2026-11-24', SP)).toBeNull()
  })
})
