// Regras da lista /eventos (logica pura, testada): em que aba cada evento cai,
// qual selo mostra e como a data aparece. Datas sempre no fuso do evento.

import type { Event, EventFormat, EventStatus, EventClosedReason } from '@/types/events'

export type EventListTab = 'upcoming' | 'drafts' | 'ended'

export type EventListItem = Pick<
  Event,
  | 'id' | 'slug' | 'title' | 'status' | 'closed_reason' | 'format' | 'starts_at' | 'ends_at'
  | 'timezone' | 'city' | 'state' | 'capacity' | 'updated_at'
>

/** Rascunho fica em Rascunhos mesmo com data passada; publicado/fechado vai para Encerrados quando o fim passa. */
export function eventListTab(ev: Pick<EventListItem, 'status' | 'ends_at'>, now: Date = new Date()): EventListTab {
  if (ev.status === 'draft') return 'drafts'
  if (ev.status === 'finished' || ev.status === 'canceled') return 'ended'
  if (ev.ends_at && new Date(ev.ends_at).getTime() <= now.getTime()) return 'ended'
  return 'upcoming'
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.NaN)

/** Proximos: o que acontece antes primeiro. Rascunhos: editado por ultimo primeiro. Encerrados: mais recente primeiro. */
export function sortForTab(items: EventListItem[], tab: EventListTab): EventListItem[] {
  const copy = [...items]
  if (tab === 'drafts') return copy.sort((a, b) => time(b.updated_at) - time(a.updated_at))
  const byStart = (a: EventListItem, b: EventListItem) => {
    const ta = time(a.starts_at)
    const tb = time(b.starts_at)
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tab === 'upcoming' ? ta - tb : tb - ta
  }
  return copy.sort(byStart)
}

export function groupByTab(items: EventListItem[], now: Date = new Date()): Record<EventListTab, EventListItem[]> {
  const groups: Record<EventListTab, EventListItem[]> = { upcoming: [], drafts: [], ended: [] }
  for (const ev of items) groups[eventListTab(ev, now)].push(ev)
  return {
    upcoming: sortForTab(groups.upcoming, 'upcoming'),
    drafts: sortForTab(groups.drafts, 'drafts'),
    ended: sortForTab(groups.ended, 'ended'),
  }
}

export type EventBadgeTone = 'success' | 'warning' | 'muted' | 'danger' | 'info'

export function eventStatusBadge(
  status: EventStatus,
  closedReason: EventClosedReason | null,
): { label: string; tone: EventBadgeTone } {
  switch (status) {
    case 'draft': return { label: 'Rascunho', tone: 'muted' }
    case 'published': return { label: 'Publicado', tone: 'success' }
    case 'closed':
      return closedReason === 'capacity'
        ? { label: 'Esgotado', tone: 'warning' }
        : { label: 'Inscrições encerradas', tone: 'warning' }
    case 'finished': return { label: 'Finalizado', tone: 'info' }
    case 'canceled': return { label: 'Cancelado', tone: 'danger' }
  }
}

export const FORMAT_LABEL: Record<EventFormat, string> = {
  presencial: 'Presencial',
  online: 'Online',
  hibrido: 'Híbrido',
}

const part = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, ...opts }).format(new Date(iso))

const weekday = (iso: string, tz: string) => part(iso, tz, { weekday: 'short' }).replace('.', '')
const hhmm = (iso: string, tz: string) => part(iso, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayKey = (iso: string, tz: string) => part(iso, tz, { year: 'numeric', month: '2-digit', day: '2-digit' })

/** Bloco de data da linha: dia e mes curto ("24", "nov"). null sem data. */
export function eventDateBlock(startsAt: string | null, tz: string): { day: string; month: string } | null {
  if (!startsAt) return null
  return {
    day: part(startsAt, tz, { day: '2-digit' }),
    month: part(startsAt, tz, { month: 'short' }).replace('.', ''),
  }
}

/** "sáb · 09:00 às 17:00 · Presencial · São Paulo, SP" (fim em outro dia: "sáb 09:00 até 30/11 17:00"). */
export function eventSummaryLine(
  ev: Pick<EventListItem, 'starts_at' | 'ends_at' | 'timezone' | 'format' | 'city' | 'state'>,
): string {
  const parts: string[] = []
  const tz = ev.timezone || 'America/Sao_Paulo'
  if (ev.starts_at) {
    const wd = weekday(ev.starts_at, tz)
    const start = hhmm(ev.starts_at, tz)
    if (!ev.ends_at) {
      parts.push(wd, start)
    } else if (dayKey(ev.starts_at, tz) === dayKey(ev.ends_at, tz)) {
      parts.push(wd, `${start} às ${hhmm(ev.ends_at, tz)}`)
    } else {
      const endDay = part(ev.ends_at, tz, { day: '2-digit', month: '2-digit' })
      parts.push(`${wd} ${start} até ${endDay} ${hhmm(ev.ends_at, tz)}`)
    }
  } else {
    parts.push('Sem data')
  }
  parts.push(FORMAT_LABEL[ev.format])
  if (ev.format !== 'online') {
    const place = [ev.city, ev.state].filter(Boolean).join(', ')
    if (place) parts.push(place)
  }
  return parts.join(' · ')
}

/** Presentes so fazem sentido depois do inicio (PRD 9.3). */
export const showAttendance = (startsAt: string | null, now: Date = new Date()): boolean =>
  !!startsAt && new Date(startsAt).getTime() <= now.getTime()

/** Link publico do evento no front atual. */
export const eventPublicUrl = (slug: string, origin: string = window.location.origin): string =>
  `${origin.replace(/\/+$/, '')}/e/${encodeURIComponent(slug)}`

/** Percentual de ocupacao para a barra (0 a 100); null sem limite. */
export function capacityPercent(registered: number, capacity: number | null): number | null {
  if (!capacity) return null
  return Math.min(100, Math.round((registered / capacity) * 100))
}
