// Conversao entre instante (ISO, UTC) e o valor de <input type="datetime-local">
// no fuso do EVENTO, nunca no do navegador (SPEC: datas sempre no timezone do evento).

const pad = (n: number) => String(n).padStart(2, '0')

/** Relogio de parede no fuso, como numeros. */
const wallClock = (ms: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

/** Diferenca (ms) entre o relogio do fuso e o UTC naquele instante. */
const offsetAt = (ms: number, timeZone: string) => {
  const w = wallClock(ms, timeZone)
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000
}

/** ISO -> "YYYY-MM-DDTHH:mm" no fuso. Nulo ou invalido vira "". */
export const toZonedInput = (iso: string | null | undefined, timeZone: string): string => {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const w = wallClock(ms, timeZone)
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`
}

/** "YYYY-MM-DDTHH:mm" no fuso -> ISO UTC. Vazio ou invalido vira null. */
export const fromZonedInput = (local: string | null | undefined, timeZone: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local ?? '')
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Duas passadas: a segunda corrige quando o palpite cai do outro lado de uma troca de horario.
  let ms = asUtc - offsetAt(asUtc, timeZone)
  ms = asUtc - offsetAt(ms, timeZone)
  return new Date(ms).toISOString()
}
