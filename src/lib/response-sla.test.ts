import { describe, it, expect } from 'vitest'
import { responseSlaMs } from './response-sla'

const HOUR = 60 * 60_000

describe('responseSlaMs', () => {
  it('usa sla_hours da empresa', () => {
    expect(responseSlaMs(4)).toBe(4 * HOUR)
  })
  it('cai em 2h quando ausente, zero ou invalido (nao mais 30 min)', () => {
    expect(responseSlaMs(undefined)).toBe(2 * HOUR)
    expect(responseSlaMs(null)).toBe(2 * HOUR)
    expect(responseSlaMs(0)).toBe(2 * HOUR)
    expect(responseSlaMs(Number.NaN)).toBe(2 * HOUR)
  })
})
