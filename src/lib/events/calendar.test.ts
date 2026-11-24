import { describe, expect, it } from 'vitest'
import { buildIcs, googleCalendarUrl, icsEscape } from './calendar'

const ev = {
  uid: 'tok123', title: 'Workshop, vendas; B2B', startsAt: '2026-11-24T12:00:00.000Z', endsAt: '2026-11-24T15:00:00.000Z',
  location: 'Auditório - São Paulo/SP', details: 'Linha 1\nLinha 2',
}

describe('calendar', () => {
  it('Google Agenda em UTC', () => {
    const url = new URL(googleCalendarUrl(ev))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('dates')).toBe('20261124T120000Z/20261124T150000Z')
    expect(url.searchParams.get('text')).toBe('Workshop, vendas; B2B')
  })

  it('ics com UID do token, UTC e texto escapado', () => {
    const ics = buildIcs(ev, new Date('2026-11-19T10:00:00Z'))
    expect(ics).toContain('UID:tok123@veltzy')
    expect(ics).toContain('DTSTART:20261124T120000Z')
    expect(ics).toContain('DTEND:20261124T150000Z')
    expect(ics).toContain('SUMMARY:Workshop\\, vendas\\; B2B')
    expect(ics).toContain('DESCRIPTION:Linha 1\\nLinha 2')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })

  it('escape', () => {
    expect(icsEscape('a\\b')).toBe('a\\\\b')
  })
})
