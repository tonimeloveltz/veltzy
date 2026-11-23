// Formatacao e captura da pagina publica do evento (bloco e). Puro, testado.

import type { EventPublic } from '@/types/events'

const fmt = (iso: string, timeZone: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone, ...o }).format(new Date(iso))
const hm = (iso: string, tz: string) => fmt(iso, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "sábado, 28 de novembro · 09:00 às 17:00" (fim noutro dia: "... 09:00 até 30 de novembro, 17:00"). */
export const eventDateLine = (startsAt: string | null, endsAt: string | null, tz: string): string => {
  if (!startsAt) return ''
  const day = (iso: string) => fmt(iso, tz, { weekday: 'long', day: 'numeric', month: 'long' })
  const sameDay = (iso: string) => fmt(iso, tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
  if (!endsAt) return `${day(startsAt)} · ${hm(startsAt, tz)}`
  if (sameDay(startsAt) === sameDay(endsAt)) return `${day(startsAt)} · ${hm(startsAt, tz)} às ${hm(endsAt, tz)}`
  return `${day(startsAt)} · ${hm(startsAt, tz)} até ${fmt(endsAt, tz, { day: 'numeric', month: 'long' })}, ${hm(endsAt, tz)}`
}

/** "28/11" */
export const shortDate = (iso: string, tz: string) => fmt(iso, tz, { day: '2-digit', month: '2-digit' })

export const STATUS_COPY: Record<Exclude<EventPublic['status'], 'open'>, string> = {
  not_open: 'Inscrições abrem em',
  sold_out: 'Vagas esgotadas',
  closed: 'Inscrições encerradas',
  finished: 'Evento finalizado',
  canceled: 'Evento cancelado',
}

export interface Tracking {
  ref: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
}

const KEYS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** ref e utm_* da URL (cortados no limite do servidor) e o referrer. */
export const readTracking = (search: string, referrer: string): Tracking => {
  const p = new URLSearchParams(search)
  const pick = (k: string, max: number) => (p.get(k)?.trim() || null)?.slice(0, max) ?? null
  const out = Object.fromEntries(KEYS.map((k) => [k, pick(k, k === 'ref' ? 80 : 200)])) as Omit<Tracking, 'referrer'>
  return { ...out, referrer: referrer ? referrer.slice(0, 500) : null }
}

/** Link de busca do Google Maps (sem embed, sem chave). */
export const mapsSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
