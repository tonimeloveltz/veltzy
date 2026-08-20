import { describe, it, expect } from 'vitest'
import { buildTrendBuckets, fetchAllRows, onlyInPipeline, periodStartMs } from './dashboard.service'

interface Row {
  id: string
}

const makeRows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))

/**
 * Servidor falso. `serverCap` e quantas linhas ele devolve no maximo por
 * resposta, independente do intervalo pedido: e assim que o PostgREST se
 * comporta com `max_rows`.
 */
const makeSource = (rows: Row[], serverCap = Infinity) => {
  const calls: { from: number; to: number }[] = []
  const query = (from: number, to: number) => {
    calls.push({ from, to })
    const size = Math.min(to - from + 1, serverCap)
    return Promise.resolve({ data: rows.slice(from, from + size), error: null })
  }
  return { query, calls }
}

describe('fetchAllRows', () => {
  it('monta o conjunto completo quando o servidor devolve MENOS que o pedido', async () => {
    // O caso que justifica o helper: teto do servidor (7) abaixo do PAGE (1000).
    // Se alguem trocar `from += rows.length` por `from += PAGE`, a segunda
    // chamada pula para 1000, volta vazia, e o resultado cai de 20 para 7.
    const rows = makeRows(20)
    const { query, calls } = makeSource(rows, 7)

    const result = await fetchAllRows(query)

    expect(result.map((r) => r.id)).toEqual(rows.map((r) => r.id))
    expect(calls[0].from).toBe(0)
    expect(calls[1].from).toBe(7)
    expect(calls[2].from).toBe(14)
  })

  it('nao para na pagina curta, so quando a resposta volta vazia', async () => {
    // Parar em `rows.length < PAGE` seria o bug: pagina curta e teto do
    // servidor sao indistinguiveis daqui. Por isso a chamada final vazia e
    // obrigatoria, nao desperdicio.
    const { query, calls } = makeSource(makeRows(20))

    const result = await fetchAllRows(query)

    expect(result).toHaveLength(20)
    expect(calls).toHaveLength(2)
  })

  it('atravessa o multiplo exato do teto do servidor', async () => {
    const { query, calls } = makeSource(makeRows(14), 7)

    const result = await fetchAllRows(query)

    expect(result).toHaveLength(14)
    expect(calls).toHaveLength(3)
  })

  it('conjunto vazio: devolve [] com exatamente uma chamada, sem laco', async () => {
    const { query, calls } = makeSource([])

    const result = await fetchAllRows(query)

    expect(result).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('propaga o erro e para na primeira chamada', async () => {
    const calls: number[] = []
    const query = (from: number) => {
      calls.push(from)
      return Promise.resolve({ data: null, error: new Error('falha na consulta') })
    }

    await expect(fetchAllRows(query)).rejects.toThrow('falha na consulta')
    expect(calls).toHaveLength(1)
  })
})

describe('onlyInPipeline', () => {
  const rows = makeRows(3)

  it('com Set, mantem so os contatos que tem negocio no pipeline', () => {
    expect(onlyInPipeline(rows, new Set(['r0', 'r2'])).map((r) => r.id)).toEqual(['r0', 'r2'])
  })

  it('com null, devolve tudo: sem recorte de pipeline o contato sem negocio continua contando', () => {
    expect(onlyInPipeline(rows, null)).toHaveLength(3)
  })

  it('trata data nula como conjunto vazio', () => {
    expect(onlyInPipeline(null, new Set(['r0']))).toEqual([])
  })
})

describe('periodStartMs', () => {
  /**
   * Ponto unico de verdade da janela do periodo. E ele que amarra o numero
   * grande do card a curva: o recorte dos contatos, o dos negocios e as faixas
   * do sparkline saem todos daqui. Se um deles recalcular a janela por conta
   * propria, registro da borda entra no numero e some da curva em silencio.
   */
  it('"Hoje" comeca a meia-noite LOCAL do dia corrente, nao 24h atras', () => {
    const at1530 = new Date(2026, 7, 17, 15, 30).getTime()

    const start = periodStartMs(1, at1530)

    expect(start).toBe(new Date(2026, 7, 17, 0, 0, 0, 0).getTime())
    // As 15h30 a janela tem 15h30, nao 24h: e essa a mudanca de semantica.
    expect(at1530 - (start as number)).toBe(15.5 * 3600000)
  })

  it('"Semana" e "Mes" continuam janela deslizante', () => {
    const now = new Date(2026, 7, 17, 15, 30).getTime()

    expect(periodStartMs(7, now)).toBe(now - 7 * 86400000)
    expect(periodStartMs(30, now)).toBe(now - 30 * 86400000)
  })

  it('"Total" nao tem inicio: devolve null e nao uma data qualquer', () => {
    // `null` e o que faz o filtro deixar tudo passar. Devolver 0 ou `now`
    // esconderia a empresa inteira ou mostraria ela toda por acidente.
    expect(periodStartMs(undefined, Date.now())).toBeNull()
  })
})

describe('buildTrendBuckets', () => {
  const now = new Date('2026-08-17T15:30:00-03:00').getTime()

  /**
   * A propriedade que sustenta a curva dos cards de KPI: as faixas cobrem a
   * janela inteira, sem sobra e sem sobreposicao. Se ela cair, um registro do
   * periodo fica sem faixa e a soma da curva passa a divergir do numero grande
   * do card sem nenhum erro aparecer.
   */
  const expectPartitionsWindow = (buckets: ReturnType<typeof buildTrendBuckets>, windowStart: number) => {
    expect(buckets[0].start).toBe(windowStart)
    expect(buckets[buckets.length - 1].end).toBe(Number.POSITIVE_INFINITY)
    buckets.slice(1).forEach((b, i) => {
      expect(b.start).toBe(buckets[i].end)
    })
  }

  // "Hoje" e calendario e a meia-noite e LOCAL, entao os instantes destes testes
  // sao construidos com o construtor local em vez de string ISO com offset fixo:
  // assim o resultado nao depende do fuso da maquina que roda a suite.
  const localMidnight = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0).getTime()

  it('divide "Hoje" em uma faixa por hora DECORRIDA, a partir da meia-noite local', () => {
    const at1530 = new Date(2026, 7, 17, 15, 30).getTime()

    const buckets = buildTrendBuckets(1, at1530, at1530)

    // 00h..15h = 16 faixas. Nao 24: faixa futura vazia desenharia a curva
    // morrendo no meio do card.
    expect(buckets).toHaveLength(16)
    expectPartitionsWindow(buckets, localMidnight(2026, 7, 17))
    expect(buckets[0].label).toBe('00h')
    expect(buckets[buckets.length - 1].label).toBe('15h')
    expect(buckets[1].start - buckets[0].start).toBe(3600000)
  })

  it('logo depois da meia-noite, "Hoje" e uma faixa so, ainda cobrindo a janela', () => {
    // Caso que traz de volta o ponto solitario do sparkline: com uma faixa unica
    // nao ha segmento para desenhar, so a bolinha.
    const at0020 = new Date(2026, 7, 17, 0, 20).getTime()

    const buckets = buildTrendBuckets(1, at0020, at0020)

    expect(buckets).toHaveLength(1)
    expectPartitionsWindow(buckets, localMidnight(2026, 7, 17))
    expect(buckets[0].label).toBe('00h')
  })

  it('"Hoje" nao alcanca ontem: negocio das 22h de ontem fica fora de toda faixa', () => {
    // O par do recorte do KPI. Se as faixas voltassem a ser janela deslizante de
    // 24h enquanto o filtro passou a ser calendario (ou o contrario), este
    // registro entraria em um dos dois e nao no outro, e a curva pararia de
    // fechar com o numero grande do card.
    const at0900 = new Date(2026, 7, 17, 9, 0).getTime()
    const ontem22h = new Date(2026, 7, 16, 22, 0).getTime()

    const buckets = buildTrendBuckets(1, at0900, at0900)

    expect(buckets.some((b) => ontem22h >= b.start && ontem22h < b.end)).toBe(false)
    expect(periodStartMs(1, at0900)).toBeGreaterThan(ontem22h)
  })

  it('divide 7 e 30 dias em uma faixa por dia', () => {
    const week = buildTrendBuckets(7, now, now)
    const month = buildTrendBuckets(30, now, now)

    expect(week).toHaveLength(7)
    expect(month).toHaveLength(30)
    expectPartitionsWindow(week, now - 7 * 86400000)
    expectPartitionsWindow(month, now - 30 * 86400000)
    expect(week[1].start - week[0].start).toBe(86400000)
  })

  it('agrupa periodos longos em no maximo 30 faixas sem deixar buraco', () => {
    const buckets = buildTrendBuckets(90, now, now)

    expect(buckets).toHaveLength(30)
    expectPartitionsWindow(buckets, now - 90 * 86400000)
    expect(buckets[1].start - buckets[0].start).toBe(3 * 86400000)
  })

  it('sem periodo, cobre por mes desde o registro mais antigo', () => {
    const earliest = new Date('2026-06-20T10:00:00-03:00').getTime()
    const buckets = buildTrendBuckets(undefined, now, earliest)

    // jun, jul, ago
    expect(buckets.map((b) => b.label)).toEqual(['jun/26', 'jul/26', 'ago/26'])
    expectPartitionsWindow(buckets, new Date(2026, 5, 1).getTime())
  })

  it('empresa sem nenhum registro ainda rende uma faixa, nao zero', () => {
    // Zero faixa faria o `.map` da curva devolver [] e o card renderizar vazio
    // por acidente em vez de por ausencia de dado.
    const buckets = buildTrendBuckets(undefined, now, now)

    expect(buckets.length).toBeGreaterThanOrEqual(1)
    expect(buckets[buckets.length - 1].end).toBe(Number.POSITIVE_INFINITY)
  })
})
