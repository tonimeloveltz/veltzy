import { describe, it, expect } from 'vitest'
import { periodStartMs, periodStartIso, previousPeriodRange } from './period-range'

/**
 * Os presets do seletor sao de CALENDARIO, como os rotulos prometem: "Semana" e
 * a semana corrente (a partir de domingo) e "Mes" e o mes corrente. Antes eram
 * janelas deslizantes de 7 e 30 dias, que faziam "Mes" mostrar dias do mes
 * passado.
 */
describe('periodStartMs', () => {
  // Todas as datas sao construidas com o construtor local, nao com string ISO
  // com offset fixo: a janela e local, entao o teste nao pode depender do fuso
  // da maquina que roda a suite.
  const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime()

  it('"Hoje" comeca a meia-noite LOCAL do dia corrente, nao 24h atras', () => {
    const at1530 = local(2026, 7, 17, 15, 30)

    const start = periodStartMs(1, at1530)

    expect(start).toBe(local(2026, 7, 17))
    expect(at1530 - (start as number)).toBe(15.5 * 3600000)
  })

  it('"Semana" comeca no domingo da semana corrente', () => {
    // 2026-08-17 e uma segunda-feira: o domingo da semana e dia 16.
    const segunda = local(2026, 7, 17, 15, 30)

    expect(periodStartMs(7, segunda)).toBe(local(2026, 7, 16))
    // No proprio domingo a janela comeca naquela madrugada, nao 7 dias antes.
    expect(periodStartMs(7, local(2026, 7, 16, 9, 0))).toBe(local(2026, 7, 16))
    // Sabado fecha a semana: ainda o mesmo domingo.
    expect(periodStartMs(7, local(2026, 7, 22, 23, 59))).toBe(local(2026, 7, 16))
  })

  it('"Semana" atravessa a virada do mes sem cair no mes errado', () => {
    // 2026-09-01 e terca; o domingo daquela semana e 30/08.
    expect(periodStartMs(7, local(2026, 8, 1, 10, 0))).toBe(local(2026, 7, 30))
  })

  it('"Mes" comeca no dia 1 do mes corrente', () => {
    expect(periodStartMs(30, local(2026, 7, 17, 15, 30))).toBe(local(2026, 7, 1))
    // Dia 3 olha 3 dias, nao 30: o fechado dia 28 do mes passado fica de fora.
    const dia3 = local(2026, 7, 3, 12, 0)
    expect(periodStartMs(30, dia3)).toBeGreaterThan(local(2026, 6, 28, 22, 0))
  })

  it('janela deslizante segue valendo acima de 31 dias (uso interno, nao do seletor)', () => {
    const now = local(2026, 7, 17, 15, 30)
    expect(periodStartMs(90, now)).toBe(now - 90 * 86400000)
  })

  it('"Total" nao tem inicio: devolve null e nao uma data qualquer', () => {
    // `null` e o que faz o filtro deixar tudo passar. Devolver 0 ou `now`
    // esconderia a empresa inteira ou mostraria ela toda por acidente.
    expect(periodStartMs(undefined, Date.now())).toBeNull()
    expect(periodStartIso(undefined, Date.now())).toBeNull()
  })

  it('periodStartIso devolve o mesmo instante de periodStartMs', () => {
    const now = local(2026, 7, 17, 15, 30)
    expect(periodStartIso(30, now)).toBe(new Date(periodStartMs(30, now) as number).toISOString())
  })
})

describe('previousPeriodRange', () => {
  const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime()

  it('"Mes" compara com o TRECHO equivalente do mes passado, nao com o mes inteiro', () => {
    // Dia 3 as 12h: 2 dias e meio corridos. Comparar contra julho inteiro
    // deixaria o badge vermelho todo comeco de mes por construcao.
    const now = local(2026, 7, 3, 12, 0)

    const prev = previousPeriodRange(30, now)!

    expect(prev.start).toBe(local(2026, 6, 1))
    expect(prev.end).toBe(local(2026, 6, 3, 12, 0))
  })

  it('"Mes" nao invade o mes corrente quando o anterior e mais curto', () => {
    // 31/03: ja correram 30 dias, mas fevereiro so tem 28. Sem o limite, a
    // janela anterior entraria em marco e contaria negocio dos dois lados.
    const now = local(2026, 2, 31, 12, 0)

    const prev = previousPeriodRange(30, now)!

    expect(prev.start).toBe(local(2026, 1, 1))
    expect(prev.end).toBe(local(2026, 2, 1))
  })

  it('"Semana" compara com o mesmo trecho da semana passada', () => {
    const segunda = local(2026, 7, 17, 15, 30)

    const prev = previousPeriodRange(7, segunda)!

    expect(prev.start).toBe(local(2026, 7, 9))
    expect(prev.end).toBe(local(2026, 7, 10, 15, 30))
  })

  it('"Hoje" segue comparando com ONTEM inteiro', () => {
    const now = local(2026, 7, 17, 9, 0)

    const prev = previousPeriodRange(1, now)!

    expect(prev.start).toBe(local(2026, 7, 16))
    expect(prev.end).toBe(local(2026, 7, 17))
  })

  it('"Total" nao tem periodo anterior', () => {
    expect(previousPeriodRange(undefined, Date.now())).toBeNull()
  })

  it('o periodo anterior nunca encosta no atual', () => {
    const now = local(2026, 7, 17, 15, 30)
    for (const days of [1, 7, 30]) {
      const prev = previousPeriodRange(days, now)!
      expect(prev.start).toBeLessThan(prev.end)
      expect(prev.end).toBeLessThanOrEqual(periodStartMs(days, now) as number)
    }
  })
})
