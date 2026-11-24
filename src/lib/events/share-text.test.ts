import { describe, expect, it } from 'vitest'
import { isValidRefCode, longDate, refCodeFromLabel, trackedUrl, whatsappShareText } from './share-text'

describe('share-text', () => {
  it('trackedUrl so leva parametros preenchidos', () => {
    expect(trackedUrl('https://app.veltzy.com/e/w', { ref: 'ana', utm_source: ' ', utm_medium: 'stories' }))
      .toBe('https://app.veltzy.com/e/w?ref=ana&utm_medium=stories')
  })

  it('data por extenso no fuso do evento', () => {
    expect(longDate('2026-11-28T12:00:00Z', 'America/Sao_Paulo')).toBe('sábado, 28 de novembro de 2026, às 09:00')
  })

  it('texto do WhatsApp com e sem vagas', () => {
    const t = whatsappShareText({ title: 'Workshop', startsAt: '2026-11-28T12:00:00Z', timeZone: 'America/Sao_Paulo', location: 'Auditório', hasCapacity: true, url: 'https://x/e/w' })
    expect(t).toBe('*Workshop*\n📅 sábado, 28 de novembro de 2026, às 09:00\n📍 Auditório\nVagas limitadas.\n\nInscrição gratuita: https://x/e/w')
    expect(whatsappShareText({ title: 'W', startsAt: null, timeZone: 'UTC', location: '', hasCapacity: false, url: 'u' })).toBe('*W*\n\nInscrição gratuita: u')
  })

  it('codigo do divulgador', () => {
    expect(refCodeFromLabel('Ana Júlia (Instagram)')).toBe('ana-julia-instagram')
    expect(isValidRefCode('ana-julia')).toBe(true)
    expect(isValidRefCode('Ana')).toBe(false)
  })
})
