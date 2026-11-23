// Textos e links da aba Divulgacao. Puro, testado.

export interface TrackingParams {
  ref?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

/** Acrescenta ref/UTM nao vazios ao link do evento. */
export const trackedUrl = (base: string, params: TrackingParams): string => {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    const clean = (v ?? '').trim()
    if (clean) url.searchParams.set(k, clean)
  }
  return url.toString()
}

/** "sábado, 28 de novembro de 2026, às 09:00" no fuso do evento. */
export const longDate = (iso: string, timeZone: string) => {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return `${date}, às ${time}`
}

export interface ShareTextInput {
  title: string
  startsAt: string | null
  timeZone: string
  location: string
  hasCapacity: boolean
  url: string
}

export const whatsappShareText = (i: ShareTextInput): string =>
  [
    `*${i.title}*`,
    i.startsAt ? `📅 ${longDate(i.startsAt, i.timeZone)}` : null,
    i.location ? `📍 ${i.location}` : null,
    i.hasCapacity ? 'Vagas limitadas.' : null,
    '',
    `Inscrição gratuita: ${i.url}`,
  ].filter((l) => l !== null).join('\n')

/** Codigo de divulgador: minusculas, a-z0-9 e hifens, ate 40 (mesma regra do banco). */
export const refCodeFromLabel = (label: string) =>
  label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')

export const isValidRefCode = (code: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(code) && code.length <= 40
