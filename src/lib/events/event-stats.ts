// Contas do painel (aba 7) sobre as inscricoes nao canceladas. Puro, testado.

import type { RegistrationRow } from '@/lib/events/registration-view'
import { registrationOrigin } from '@/lib/events/registration-view'

type StatsRow = Pick<RegistrationRow, 'status' | 'created_at' | 'confirmed_at' | 'checked_in_at' | 'ref_code' | 'utm_source'>

export interface EventStats {
  registered: number
  capacity: number | null
  remaining: number | null
  confirmed: number
  confirmedPct: number
  attended: number
  /** presentes / (presentes + ausentes); null antes de haver ausentes ou presentes. */
  attendanceRate: number | null
  perDay: Array<{ day: string; label: string; registrations: number; checkins: number }>
  byOrigin: Array<{ origin: string; registrations: number; attended: number }>
  funnel: { registered: number; confirmed: number; attended: number }
}

const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

const dayLabel = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`

/** Ultimos 14 dias ou desde a criacao do evento (o que for menor), em dias do fuso do evento. */
const dayRange = (createdAt: string, now: Date, timeZone: string): string[] => {
  const end = now.getTime()
  const start = Math.max(Date.parse(createdAt), end - 13 * 86400000)
  const days: string[] = []
  for (let t = start; t <= end; t += 86400000) {
    const k = dayKey(new Date(t).toISOString(), timeZone)
    if (!days.includes(k)) days.push(k)
  }
  const last = dayKey(now.toISOString(), timeZone)
  if (!days.includes(last)) days.push(last)
  return days.slice(-14)
}

export const computeEventStats = (
  rows: StatsRow[], opts: { capacity: number | null; createdAt: string; timeZone: string; now?: Date },
): EventStats => {
  const now = opts.now ?? new Date()
  const active = rows.filter((r) => r.status !== 'canceled')
  const registered = active.length
  const confirmed = active.filter((r) => r.confirmed_at !== null).length
  const attended = active.filter((r) => r.status === 'attended').length
  const absent = active.filter((r) => r.status === 'absent').length

  const days = dayRange(opts.createdAt, now, opts.timeZone)
  const perDay = days.map((day) => ({
    day, label: dayLabel(day),
    registrations: active.filter((r) => dayKey(r.created_at, opts.timeZone) === day).length,
    checkins: active.filter((r) => r.checked_in_at && dayKey(r.checked_in_at, opts.timeZone) === day).length,
  }))

  const origins = new Map<string, { registrations: number; attended: number }>()
  for (const r of active) {
    const o = registrationOrigin(r)
    const cur = origins.get(o) ?? { registrations: 0, attended: 0 }
    cur.registrations += 1
    if (r.status === 'attended') cur.attended += 1
    origins.set(o, cur)
  }

  return {
    registered,
    capacity: opts.capacity,
    remaining: opts.capacity === null ? null : Math.max(0, opts.capacity - registered),
    confirmed,
    confirmedPct: registered === 0 ? 0 : Math.round((confirmed / registered) * 100),
    attended,
    attendanceRate: attended + absent === 0 ? null : Math.round((attended / (attended + absent)) * 100),
    perDay,
    byOrigin: [...origins.entries()].map(([origin, v]) => ({ origin, ...v }))
      .sort((a, b) => b.registrations - a.registrations),
    funnel: { registered, confirmed, attended },
  }
}
