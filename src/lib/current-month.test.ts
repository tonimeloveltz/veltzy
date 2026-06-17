import { describe, it, expect } from 'vitest'
import { isClosedInCurrentMonth } from './current-month'

// "agora" fixo: 16/06/2026 12:00 SP (=15:00Z). Sem fake timers: passamos now.
const now = new Date('2026-06-16T15:00:00Z')

describe('isClosedInCurrentMonth (mes corrente, fuso SP)', () => {
  it('null/undefined -> false', () => {
    expect(isClosedInCurrentMonth(null, now)).toBe(false)
    expect(isClosedInCurrentMonth(undefined, now)).toBe(false)
  })

  it('1o dia do mes corrente (SP) -> true', () => {
    expect(isClosedInCurrentMonth('2026-06-01T03:30:00-03:00', now)).toBe(true)
  })

  it('ultimo dia do mes anterior (SP) -> false', () => {
    expect(isClosedInCurrentMonth('2026-05-31T23:00:00-03:00', now)).toBe(false)
  })

  it('borda timezone: UTC ja e junho mas em SP ainda e 31/maio -> false', () => {
    // 2026-06-01T02:00:00Z == 2026-05-31 23:00 em SP (UTC-3)
    expect(isClosedInCurrentMonth('2026-06-01T02:00:00Z', now)).toBe(false)
  })

  it('borda timezone: UTC ja e julho mas em SP ainda e 30/junho -> true', () => {
    // 2026-07-01T02:00:00Z == 2026-06-30 23:00 em SP -> mes corrente
    expect(isClosedInCurrentMonth('2026-07-01T02:00:00Z', now)).toBe(true)
  })

  it('mes anterior comum -> false; mes seguinte -> false', () => {
    expect(isClosedInCurrentMonth('2026-04-10T12:00:00-03:00', now)).toBe(false)
    expect(isClosedInCurrentMonth('2026-07-10T12:00:00-03:00', now)).toBe(false)
  })

  it('fechado agora mesmo -> true', () => {
    expect(isClosedInCurrentMonth(now.toISOString(), now)).toBe(true)
  })
})
