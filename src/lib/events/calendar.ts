// "Adicionar ao Google Agenda" e arquivo .ics da inscricao (gerado no navegador). Horarios em UTC.

export interface CalendarEvent {
  uid: string
  title: string
  startsAt: string
  endsAt: string
  location: string
  details: string
}

const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const googleCalendarUrl = (e: CalendarEvent): string => {
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: e.title, dates: `${utcStamp(e.startsAt)}/${utcStamp(e.endsAt)}`,
    details: e.details, location: e.location,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

/** Escapa texto do iCalendar (RFC 5545): barra, ponto e virgula, virgula e quebra de linha. */
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export const buildIcs = (e: CalendarEvent, now = new Date()): string => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Veltzy//Eventos//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  `UID:${e.uid}@veltzy`,
  `DTSTAMP:${utcStamp(now.toISOString())}`,
  `DTSTART:${utcStamp(e.startsAt)}`,
  `DTEND:${utcStamp(e.endsAt)}`,
  `SUMMARY:${icsEscape(e.title)}`,
  `LOCATION:${icsEscape(e.location)}`,
  `DESCRIPTION:${icsEscape(e.details)}`,
  'END:VEVENT', 'END:VCALENDAR', '',
].join('\r\n')
