import { describe, expect, it } from 'vitest'
import { eventDateLine, mapsSearchUrl, readTracking } from './public-event'

const SP = 'America/Sao_Paulo'

describe('public-event', () => {
  it('linha de data no fuso do evento', () => {
    expect(eventDateLine('2026-11-28T12:00:00Z', '2026-11-28T20:00:00Z', SP)).toBe('sábado, 28 de novembro · 09:00 às 17:00')
    expect(eventDateLine('2026-11-28T12:00:00Z', '2026-11-30T20:00:00Z', SP)).toBe('sábado, 28 de novembro · 09:00 até 30 de novembro, 17:00')
    expect(eventDateLine(null, null, SP)).toBe('')
  })

  it('captura ref e utm da URL', () => {
    const t = readTracking('?ref=ana&utm_source=ig&utm_medium=&x=1', 'https://instagram.com/')
    expect(t).toEqual({ ref: 'ana', utm_source: 'ig', utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, referrer: 'https://instagram.com/' })
    expect(readTracking('', '').referrer).toBeNull()
  })

  it('maps', () => {
    expect(mapsSearchUrl('Rua A, 10 - São Paulo')).toBe('https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%20-%20S%C3%A3o%20Paulo')
  })
})
