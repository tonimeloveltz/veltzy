// Cadencia de contato: calculo puro sobre os eventos de veltzy.lead_contact_events.
//
// Tudo aqui e dia de CALENDARIO no fuso America/Sao_Paulo, nao intervalo de
// horas. Um contato as 23h50 e outro as 00h10 do dia seguinte sao D+0 e D+1,
// apesar de separados por 20 minutos: e o que "D+N" promete.
//
// O fuso e EXPLICITO em toda conversao (mesma tecnica de current-month.ts). Com
// hora local do browser, um vendedor em viagem ou com o relogio do sistema em
// outro fuso veria D+N e "contato hoje" deslocados em um dia, sem erro nenhum
// aparecer na tela.
//
// Modulo puro de proposito: sem React, sem Supabase, sem localStorage e sem
// relogio implicito (todo "agora" entra por parametro). E o que torna
// contact-cadence.test.ts possivel sem mock de ambiente.

import type { LeadContactEvent } from '@/types/database'

export const SP_TZ = 'America/Sao_Paulo'

const MS_PER_DAY = 86_400_000

export interface CadenceTimelineEntry {
  id: string
  /** ISO, como veio do banco. */
  contactedAt: string
  /** 'YYYY-MM-DD' em SP. */
  dayKey: string
  /** Dias desde o PRIMEIRO contato do lead. O primeiro e sempre 0. */
  dPlus: number
  registeredBy: string | null
}

// 'en-CA' formata como YYYY-MM-DD, que ja e ordenavel como string.
const spDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Dia de calendario do instante NO FUSO DE SAO PAULO, como 'YYYY-MM-DD'. */
export const spDateKey = (date: Date | string): string =>
  spDateFormatter.format(typeof date === 'string' ? new Date(date) : date)

/**
 * Diferenca em dias de calendario entre duas chaves de `spDateKey`
 * (`toKey - fromKey`). Negativo se `toKey` for anterior.
 *
 * As chaves ja sao dias de calendario em SP. Para contar a diferenca entre
 * elas, tratar cada uma como meia-noite UTC: dois instantes sem fuso, so
 * numeros. Assim a subtracao e sempre multiplo exato de 86400000, e nenhuma
 * mudanca de horario de verao entra na conta -- que e o que aconteceria
 * subtraindo dois Date construidos em horario local.
 */
export const daysBetweenSpDates = (fromKey: string, toKey: string): number => {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY)
}

/**
 * Entradas prontas para render, em ordem DECRESCENTE (mais recente primeiro).
 *
 * Nao confia na ordem recebida: ordena internamente para achar o primeiro
 * contato, que e a referencia do D+N. Dois eventos no mesmo dia de calendario
 * recebem o MESMO dPlus -- o selo mede dias desde o primeiro contato, nao
 * posicao na lista.
 */
export const buildCadenceTimeline = (events: LeadContactEvent[]): CadenceTimelineEntry[] => {
  if (events.length === 0) return []

  const ascending = [...events].sort(
    (a, b) => new Date(a.contacted_at).getTime() - new Date(b.contacted_at).getTime()
  )
  const firstDayKey = spDateKey(ascending[0].contacted_at)

  return ascending
    .map((event) => {
      const dayKey = spDateKey(event.contacted_at)
      return {
        id: event.id,
        contactedAt: event.contacted_at,
        dayKey,
        dPlus: daysBetweenSpDates(firstDayKey, dayKey),
        registeredBy: event.registered_by,
      }
    })
    .reverse()
}

/**
 * Resumo do ULTIMO contato. `null` quando nao ha evento nenhum.
 *
 * `contacted_at` no futuro (o banco nao impede) clampa em "hoje": "ha -1 dias"
 * nao vai para a tela.
 */
export const lastContactLabel = (
  events: LeadContactEvent[],
  now: Date = new Date(),
): string | null => {
  if (events.length === 0) return null

  const lastMs = Math.max(...events.map((e) => new Date(e.contacted_at).getTime()))
  const days = Math.max(0, daysBetweenSpDates(spDateKey(new Date(lastMs)), spDateKey(now)))

  if (days === 0) return 'Último contato hoje'
  if (days === 1) return 'Último contato ontem'
  return `Último contato há ${days} dias`
}

/** Existe contato registrado no dia de calendario de `now` (em SP)? */
export const hasContactToday = (
  events: LeadContactEvent[],
  now: Date = new Date(),
): boolean => {
  const todayKey = spDateKey(now)
  return events.some((e) => spDateKey(e.contacted_at) === todayKey)
}
