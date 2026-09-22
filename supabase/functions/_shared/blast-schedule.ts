// Escalonamento anti-ban do disparo em massa (mkt-ativo · §4bis da SPEC).
// Logica PURA e testavel: dado N destinatarios, calcula o scheduled_at de cada
// item respeitando throttle+jitter, teto diario por instancia e janela de horario.
// NAO enfileira nada (isso e a etapa segurada da edge) — so calcula os horarios.
//
// Para provider NAO-OFICIAL (Evolution/WAHA) enforce=true: aplica o piso anti-ban.
// Para OFICIAL (Cloud API) enforce=false: espacamento leve + respeita a janela SO
// se o throttle_config a definir (a Meta cuida do resto por HSM).

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export interface ThrottleConfig {
  delay_min?: number // segundos entre itens (piso do jitter)
  delay_max?: number // segundos entre itens (teto do jitter)
  daily_cap?: number // maximo de envios por instancia por dia (so nao-oficial)
  window_start?: number // hora local de inicio da janela (0-23)
  window_end?: number // hora local de fim da janela (1-24), exclusiva
}

// Piso de sistema enforcado para nao-oficial mesmo sem config do usuario (§4bis).
// Numeros batidos pelo Toni: 30-90s jitter, 50/dia/instancia, janela 08-20.
export const SYSTEM_THROTTLE_DEFAULTS: Required<ThrottleConfig> = {
  delay_min: 30,
  delay_max: 90,
  daily_cap: 50,
  window_start: 8,
  window_end: 20,
}

// Espacamento leve para provider oficial (Cloud API), sem teto diario.
export const OFFICIAL_DELAY_SECONDS = 1

export interface ScheduleItem {
  // Chave que agrupa o teto diario (instancia/numero que vai enviar). Itens da
  // mesma instancia compartilham o daily_cap; instancias diferentes contam separado.
  instanceKey: string
}

export interface ScheduleOptions {
  throttle?: ThrottleConfig | null // override por-campanha; null = defaults de sistema
  enforce: boolean // true = nao-oficial (aplica piso anti-ban); false = oficial
  now: Date
  tzOffsetMinutes: number // minutos a somar ao UTC p/ obter o horario local da company (BRT = -180)
  rng?: () => number // injetavel p/ teste; default Math.random
}

// Horario local (ms) a partir do UTC (ms).
const toLocal = (utcMs: number, tz: number) => utcMs + tz * 60_000
// Volta de local (ms) para UTC (ms).
const toUtc = (localMs: number, tz: number) => localMs - tz * 60_000
// Hora do dia (0-24, fracionaria) de um instante local.
const hourOfDay = (localMs: number) => (((localMs % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS
// Meia-noite local do dia de um instante local.
const startOfDay = (localMs: number) => Math.floor(localMs / DAY_MS) * DAY_MS
// Indice do dia local (para agrupar o teto diario).
const dayIndex = (localMs: number) => Math.floor(localMs / DAY_MS)

// Empurra um instante local para DENTRO da janela [start,end). Antes do inicio:
// vai para o inicio de hoje. No fim/depois: vai para o inicio de amanha.
function moveIntoWindow(localMs: number, start: number, end: number): number {
  const h = hourOfDay(localMs)
  if (h < start) return startOfDay(localMs) + start * HOUR_MS
  if (h >= end) return startOfDay(localMs) + DAY_MS + start * HOUR_MS
  return localMs
}

/**
 * Calcula scheduled_at (ISO UTC) de cada item, em ordem, respeitando §4bis.
 * Determinístico dado um `rng` fixo (para teste).
 */
export function computeBlastSchedule(
  items: ScheduleItem[],
  opts: ScheduleOptions,
): { scheduled_at: string }[] {
  const rng = opts.rng ?? Math.random
  const cfg: Required<ThrottleConfig> = {
    ...SYSTEM_THROTTLE_DEFAULTS,
    ...(opts.throttle ?? {}),
  }
  const applyWindow = opts.enforce || opts.throttle?.window_start != null
  const applyDailyCap = opts.enforce

  let cursor = toLocal(opts.now.getTime(), opts.tzOffsetMinutes)
  const perInstanceDay = new Map<string, number>()
  const out: { scheduled_at: string }[] = []

  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      const delaySec = opts.enforce
        ? cfg.delay_min + rng() * (cfg.delay_max - cfg.delay_min)
        : OFFICIAL_DELAY_SECONDS
      cursor += delaySec * 1000
    }

    if (applyWindow) cursor = moveIntoWindow(cursor, cfg.window_start, cfg.window_end)

    if (applyDailyCap) {
      // Reprograma para o proximo dia enquanto a instancia estourou o teto do dia.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const key = `${items[i].instanceKey}|${dayIndex(cursor)}`
        const used = perInstanceDay.get(key) ?? 0
        if (used >= cfg.daily_cap) {
          cursor = startOfDay(cursor) + DAY_MS + cfg.window_start * HOUR_MS
          continue
        }
        perInstanceDay.set(key, used + 1)
        break
      }
    }

    out.push({ scheduled_at: new Date(toUtc(cursor, opts.tzOffsetMinutes)).toISOString() })
  }

  return out
}
