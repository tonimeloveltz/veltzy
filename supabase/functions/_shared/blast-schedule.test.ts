import { assertEquals } from 'jsr:@std/assert@1'
import {
  computeBlastSchedule,
  OFFICIAL_DELAY_SECONDS,
  SYSTEM_THROTTLE_DEFAULTS,
  type ScheduleItem,
} from './blast-schedule.ts'

// BRT = UTC-3 → offset -180 min. rng fixo em 0.5 → jitter no meio da faixa (60s).
const BRT = -180
const rngHalf = () => 0.5

function items(n: number, instanceKey = 'inst-A'): ScheduleItem[] {
  return Array.from({ length: n }, () => ({ instanceKey }))
}

// Hora local (0-24) de um ISO UTC no fuso BRT.
function localHour(iso: string): number {
  const localMs = new Date(iso).getTime() + BRT * 60_000
  return (((localMs % 86_400_000) + 86_400_000) % 86_400_000) / 3_600_000
}

Deno.test('nao-oficial: jitter fica na faixa 30-90s entre itens consecutivos', () => {
  // 10h local BRT = 13h UTC (dentro da janela 08-20).
  const now = new Date('2026-09-22T13:00:00.000Z')
  const res = computeBlastSchedule(items(5), { enforce: true, now, tzOffsetMinutes: BRT, rng: rngHalf })
  for (let i = 1; i < res.length; i++) {
    const gap = (new Date(res[i].scheduled_at).getTime() - new Date(res[i - 1].scheduled_at).getTime()) / 1000
    // rng=0.5 → 30 + 0.5*(90-30) = 60s
    assertEquals(gap, 60)
  }
})

Deno.test('nao-oficial: teto diario por instancia reprograma o excedente pro dia seguinte', () => {
  const now = new Date('2026-09-22T13:00:00.000Z') // 10h BRT
  const cap = SYSTEM_THROTTLE_DEFAULTS.daily_cap // 50
  const res = computeBlastSchedule(items(cap + 3), { enforce: true, now, tzOffsetMinutes: BRT, rng: rngHalf })
  const day = (iso: string) => Math.floor((new Date(iso).getTime() + BRT * 60_000) / 86_400_000)
  const firstDay = day(res[0].scheduled_at)
  // Os 50 primeiros no mesmo dia; do 51 em diante, dia seguinte.
  assertEquals(day(res[cap - 1].scheduled_at), firstDay)
  assertEquals(day(res[cap].scheduled_at), firstDay + 1)
  assertEquals(day(res[cap + 2].scheduled_at), firstDay + 1)
})

Deno.test('nao-oficial: teto conta por-instancia (instancias distintas nao somam)', () => {
  const now = new Date('2026-09-22T13:00:00.000Z')
  const cap = SYSTEM_THROTTLE_DEFAULTS.daily_cap
  // Alterna 2 instancias: cada uma recebe cap itens, ninguem estoura no dia 1.
  const mixed: ScheduleItem[] = Array.from({ length: cap * 2 }, (_, i) => ({
    instanceKey: i % 2 === 0 ? 'inst-A' : 'inst-B',
  }))
  const res = computeBlastSchedule(mixed, { enforce: true, now, tzOffsetMinutes: BRT, rng: rngHalf })
  const day = (iso: string) => Math.floor((new Date(iso).getTime() + BRT * 60_000) / 86_400_000)
  const firstDay = day(res[0].scheduled_at)
  // Todos cabem no dia 1 (cap por instancia, nao global).
  for (const r of res) assertEquals(day(r.scheduled_at), firstDay)
})

Deno.test('janela: envio fora de 08-20 e reprogramado pro proximo inicio de janela', () => {
  // 22h BRT = 01h UTC do dia seguinte → fora da janela; deve ir pra 08h local.
  const now = new Date('2026-09-23T01:00:00.000Z') // 22h BRT do dia 22
  const res = computeBlastSchedule(items(1), { enforce: true, now, tzOffsetMinutes: BRT, rng: rngHalf })
  assertEquals(localHour(res[0].scheduled_at), SYSTEM_THROTTLE_DEFAULTS.window_start) // 08h
})

Deno.test('janela: antes das 08h reprograma pra 08h do mesmo dia', () => {
  const now = new Date('2026-09-22T09:00:00.000Z') // 06h BRT
  const res = computeBlastSchedule(items(1), { enforce: true, now, tzOffsetMinutes: BRT, rng: rngHalf })
  assertEquals(localHour(res[0].scheduled_at), 8)
})

Deno.test('oficial (Cloud API): espacamento leve, sem teto diario, sem janela por padrao', () => {
  const now = new Date('2026-09-23T01:00:00.000Z') // 22h BRT (fora da janela)
  const res = computeBlastSchedule(items(100), { enforce: false, now, tzOffsetMinutes: BRT })
  // Espacamento fixo leve.
  const gap = (new Date(res[1].scheduled_at).getTime() - new Date(res[0].scheduled_at).getTime()) / 1000
  assertEquals(gap, OFFICIAL_DELAY_SECONDS)
  // Sem janela: o 1o item sai no proprio horario (22h), nao reprogramado.
  assertEquals(Math.round(localHour(res[0].scheduled_at)), 22)
  // Sem teto: 100 itens no mesmo dia.
  const day = (iso: string) => Math.floor((new Date(iso).getTime() + BRT * 60_000) / 86_400_000)
  assertEquals(day(res[0].scheduled_at), day(res[99].scheduled_at))
})

Deno.test('oficial com janela configurada: respeita a janela do throttle_config', () => {
  const now = new Date('2026-09-23T01:00:00.000Z') // 22h BRT
  const res = computeBlastSchedule(items(1), {
    enforce: false,
    now,
    tzOffsetMinutes: BRT,
    throttle: { window_start: 9, window_end: 18 },
  })
  assertEquals(localHour(res[0].scheduled_at), 9)
})

Deno.test('primeiro item nao leva delay; sai no horario base (dentro da janela)', () => {
  const now = new Date('2026-09-22T13:00:00.000Z') // 10h BRT
  const res = computeBlastSchedule(items(3), { enforce: true, now, tzOffsetMinutes: BRT, rng: rngHalf })
  assertEquals(res[0].scheduled_at, now.toISOString())
})
