import { describe, expect, it } from 'vitest'
import { willNotifyDateChange } from './date-change-notice'

const now = new Date('2026-11-27T12:00:00Z') // 27/11 09:00 em SP
const base = {
  status: 'published' as const, savedStartsAt: '2026-11-30T09:00', newStartsAt: '2026-12-01T09:00',
  timezone: 'America/Sao_Paulo', noticeEnabled: true, now,
}

describe('willNotifyDateChange', () => {
  it('avisa quando o dia muda em evento publicado ou fechado', () => {
    expect(willNotifyDateChange(base)).toBe(true)
    expect(willNotifyDateChange({ ...base, status: 'closed' })).toBe(true)
  })
  it('so a hora mudou no mesmo dia: nao avisa', () => {
    expect(willNotifyDateChange({ ...base, newStartsAt: '2026-11-30T19:30' })).toBe(false)
  })
  it('rascunho, encerrado, cancelado ou aviso desligado: nao avisa', () => {
    for (const status of ['draft', 'finished', 'canceled'] as const) {
      expect(willNotifyDateChange({ ...base, status })).toBe(false)
    }
    expect(willNotifyDateChange({ ...base, noticeEnabled: false })).toBe(false)
  })
  it('inicio novo no passado: nao avisa', () => {
    expect(willNotifyDateChange({ ...base, newStartsAt: '2026-11-26T09:00' })).toBe(false)
  })
})
