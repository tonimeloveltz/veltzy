import { supabase, veltzy } from '@/lib/supabase'
import { periodStartMs, periodStartIso, previousPeriodRange } from '@/lib/period-range'
import type { ConversionMetrics, SourceMetrics, StageMetrics, SellerMetrics, MonthlyData } from '@/types/database'

// Janela do periodo em ISO, do jeito que as queries pedem. A semantica (mes
// corrente, semana corrente, hoje) vive em `@/lib/period-range`.
const getPeriodDates = (days: number) => {
  const now = Date.now()
  const start = periodStartMs(days, now) ?? now
  const prev = previousPeriodRange(days, now)
  return {
    start: new Date(start).toISOString(),
    end: new Date(now).toISOString(),
    prevStart: new Date(prev?.start ?? start).toISOString(),
    prevEnd: new Date(prev?.end ?? start).toISOString(),
  }
}

interface PagedResponse<T> {
  data: T[] | null
  error: unknown
}

/**
 * Busca TODAS as linhas de uma query, pagina a pagina.
 *
 * O PostgREST corta a resposta em `max_rows` (1000 em `supabase/config.toml`)
 * sem avisar e sem erro, entao qualquer contagem derivada de `data.length` capa
 * naquele teto em silencio. Contagem vinda do servidor (`count: 'exact'` com
 * `head: true`) nao sofre disso e nao precisa deste helper.
 *
 * Avanca pelo tamanho recebido em vez de assumir 1000, entao funciona com
 * qualquer `max_rows` do ambiente. `buildQuery` recebe o intervalo e precisa
 * ordenar por chave unica, senao a paginacao repete ou pula linhas.
 *
 * Exportada para teste (`dashboard.service.test.ts`), nao para uso externo.
 */
export const fetchAllRows = async <T>(buildQuery: (from: number, to: number) => PromiseLike<PagedResponse<T>>): Promise<T[]> => {
  const PAGE = 1000
  const all: T[] = []
  let from = 0

  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) break
    all.push(...rows)
    from += rows.length
  }

  return all
}

/**
 * Contatos que tem negocio no pipeline informado.
 *
 * O pipeline e do negocio, nao do contato. `leads.pipeline_id` congela quando o
 * contato passa a ter 2+ negocios (a trava multi-deal do gatilho
 * `mirror_deal_to_lead` faz o espelho se calar), entao filtrar por aquela coluna
 * atribui o contato a um pipeline por acidente historico: ele some de um
 * pipeline onde tem negocio aberto e aparece em outro onde nao tem nenhum.
 *
 * Duas consequencias assumidas ao trocar a fonte do recorte:
 * - contato com negocios em pipelines diferentes passa a contar nos dois, entao
 *   a soma por pipeline pode ultrapassar o total sem filtro. E o comportamento
 *   correto: ele esta nos dois mesmo;
 * - contato sem negocio nenhum sai de toda metrica filtrada por pipeline, porque
 *   nao ha negocio que o coloque em pipeline algum. Sem filtro ele continua
 *   contando normalmente.
 *
 * Nao filtra por status: um negocio ganho ou perdido tambem colocou o contato
 * naquele pipeline.
 *
 * Usa `fetchAllRows` porque o conjunto precisa estar COMPLETO: um corte aqui
 * faria contatos sumirem das metricas em silencio.
 */
const getLeadIdsInPipeline = async (companyId: string, pipelineId: string): Promise<Set<string>> => {
  const rows = await fetchAllRows<{ lead_id: string | null }>((from, to) =>
    veltzy()
      .from('deals')
      .select('lead_id')
      .eq('company_id', companyId)
      .eq('pipeline_id', pipelineId)
      .order('id')
      .range(from, to)
  )

  const ids = new Set<string>()
  rows.forEach((d) => { if (d.lead_id) ids.add(d.lead_id) })
  return ids
}

/**
 * Recorte de pipeline sobre contatos ja carregados. `null` = sem filtro.
 * Exportada para teste (`dashboard.service.test.ts`), nao para uso externo.
 */
export const onlyInPipeline = <T extends { id: string }>(rows: T[] | null, leadIds: Set<string> | null): T[] => {
  const all = rows ?? []
  return leadIds ? all.filter((r) => leadIds.has(r.id)) : all
}

/**
 * Data que coloca o negocio no periodo: ganho e perdido contam quando fecharam,
 * o resto conta quando entrou no funil.
 *
 * PONTO UNICO DE VERDADE do recorte de negocio no dashboard. TODA metrica que
 * conta negocio por periodo passa por aqui - KPIs, curva, comparativo mensal,
 * grade mensal e performance por vendedor. Filtrar por `created_at` no servidor
 * parece equivalente e nao e: o negocio lancado hoje com fechamento retroativo
 * (checkbox "Negocio fechado" do Novo Negocio) cairia no mes em que foi
 * digitado, nao no mes em que fechou, e duas telas do mesmo dashboard dariam
 * numeros diferentes para o mesmo negocio.
 *
 * Exportada para teste, nao para uso externo.
 */
export const dealRefDate = (d: { status: string; created_at: string; closed_at: string | null }) =>
  d.status === 'won' || d.status === 'lost' ? d.closed_at ?? d.created_at : d.created_at

/** Colunas que todo recorte por `dealRefDate` precisa ler. */
export interface DealPeriodRow {
  status: string
  value: number | null
  created_at: string
  closed_at: string | null
  assigned_to: string | null
}

/**
 * Negocios da empresa para as metricas de periodo.
 *
 * Traz o conjunto INTEIRO e deixa o recorte para o JS, porque o criterio depende
 * do status (ver `dealRefDate`) e uma clausula `.gte()` so sabe olhar uma coluna.
 *
 * `fetchAllRows` nao e opcional: sem paginacao a lista capa em `max_rows` e a
 * metrica encolhe sem erro nenhum aparecer.
 */
const fetchDealsForMetrics = (companyId: string, pipelineId?: string, sellerProfileId?: string): Promise<DealPeriodRow[]> =>
  fetchAllRows<DealPeriodRow>((from, to) => {
    let q = veltzy()
      .from('deals')
      .select('status, value, created_at, closed_at, assigned_to')
      .eq('company_id', companyId)
    if (pipelineId) q = q.eq('pipeline_id', pipelineId)
    if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
    return q.order('id').range(from, to)
  })

/** `dealRefDate` dentro de [from, to). `to` ausente = sem limite superior. */
const dealInWindow = (d: DealPeriodRow, from: string, to?: string) => {
  const ref = dealRefDate(d)
  return ref >= from && (to === undefined || ref < to)
}

export const getConversionMetrics = async (companyId: string, days = 30, pipelineId?: string, sellerProfileId?: string): Promise<ConversionMetrics> => {
  const { start, prevStart, prevEnd } = getPeriodDates(days)

  const leadIdsInPipeline = pipelineId ? await getLeadIdsInPipeline(companyId, pipelineId) : null

  // Leads count (total leads created in period)
  //
  // Dois caminhos de proposito. Sem recorte de pipeline, `count: 'exact'` com
  // `head: true` conta no servidor: e exato e imune a `max_rows`. Com recorte,
  // os ids precisam voltar para o cruzamento, e ai a paginacao e obrigatoria,
  // senao a contagem capa em `max_rows` sem sintoma.
  const countLeadsInWindow = async (windowStart: string, windowEnd?: string): Promise<number> => {
    if (!leadIdsInPipeline) {
      let q = veltzy().from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', windowStart)
      if (windowEnd) q = q.lt('created_at', windowEnd)
      if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    }

    const rows = await fetchAllRows<{ id: string }>((from, to) => {
      let q = veltzy().from('leads').select('id').eq('company_id', companyId).gte('created_at', windowStart)
      if (windowEnd) q = q.lt('created_at', windowEnd)
      if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
      return q.order('id').range(from, to)
    })
    return onlyInPipeline(rows, leadIdsInPipeline).length
  }

  const currentLeadsCount = await countLeadsInWindow(start)

  // Previous period leads count
  const prevLeadsCount = await countLeadsInWindow(prevStart, prevEnd)

  // Negocios dos dois periodos, recortados por `dealRefDate`: o ganho conta no
  // periodo em que FECHOU, nao naquele em que foi digitado.
  const allDeals = await fetchDealsForMetrics(companyId, pipelineId, sellerProfileId)
  const currentDeals = allDeals.filter((d) => dealInWindow(d, start))
  const prevDeals = allDeals.filter((d) => dealInWindow(d, prevStart, prevEnd))

  const calc = (leadsTotal: number, deals: DealPeriodRow[]) => {
    const won = deals.filter((d) => d.status === 'won')
    const revenue = won.reduce((sum, d) => sum + (Number(d.value) || 0), 0)
    return { total: leadsTotal, deals: won.length, rate: leadsTotal > 0 ? (won.length / leadsTotal) * 100 : 0, revenue }
  }

  const c = calc(currentLeadsCount, currentDeals)
  const p = calc(prevLeadsCount, prevDeals)

  return {
    totalLeads: c.total, dealsClosed: c.deals, conversionRate: Math.round(c.rate * 10) / 10, totalRevenue: c.revenue,
    prevTotalLeads: p.total, prevDealsClosed: p.deals, prevConversionRate: Math.round(p.rate * 10) / 10, prevTotalRevenue: p.revenue,
  }
}

const MONTH_NAMES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * Um ponto da curva dos cards de KPI.
 *
 * `conversionRate` e `avgAiScore` sao `null` quando a faixa nao teve nenhum
 * negocio / nenhum contato: media de nada nao e zero, e desenhar zero criaria um
 * vale que nao aconteceu. O grafico liga os pontos por cima do buraco.
 * `dealsClosed` e contagem, entao faixa vazia e zero de verdade.
 */
export interface KpiTrendPoint {
  label: string
  conversionRate: number | null
  avgAiScore: number | null
  dealsClosed: number
}

interface TrendBucket {
  start: number
  end: number
  label: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')


/**
 * Fatia o periodo selecionado em faixas que o cobrem por INTEIRO, sem sobra e
 * sem sobreposicao. E isso que faz a curva fechar com o numero grande do card:
 * cada registro do periodo cai em exatamente uma faixa, entao a soma dos pontos
 * e o total exibido.
 *
 * A janela vem de `periodStartMs`, a MESMA usada pelo recorte dos KPIs: os
 * presets do seletor sao de calendario (hoje, semana corrente, mes corrente).
 * Calcular a janela aqui de novo abriria a porta para faixas e filtro
 * divergirem.
 *
 * Sem periodo ("Total"), o recorte e por mes de calendario a partir do registro
 * mais antigo, porque a janela e a vida inteira da empresa.
 *
 * A ultima faixa termina no infinito para abrigar o registro salvo neste exato
 * instante (e o de `closed_at` levemente adiantado por relogio dessincronizado).
 */
export const buildTrendBuckets = (days: number | undefined, now: number, earliest: number): TrendBucket[] => {
  const buckets: TrendBucket[] = []
  const windowStart = periodStartMs(days, now)

  // `windowStart === null` acontece exatamente quando `days` e `undefined`; o
  // teste duplo esta aqui para o compilador estreitar os dois de uma vez.
  if (days === undefined || windowStart === null) {
    const first = new Date(Math.min(earliest, now))
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
    while (cursor.getTime() <= now) {
      const start = cursor.getTime()
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime()
      buckets.push({
        start,
        end: next,
        label: `${MONTH_NAMES_PT[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else if (days <= 1) {
    // "Hoje" = uma faixa por hora DECORRIDA, da meia-noite local ate a hora
    // corrente. Nao sao 24 fixas: faixa futura vazia desenharia a curva morrendo
    // no meio do card.
    const width = 3600000
    const slots = new Date(now).getHours() + 1
    for (let i = 0; i < slots; i++) {
      const start = windowStart + i * width
      buckets.push({ start, end: start + width, label: `${pad2(new Date(start).getHours())}h` })
    }
  } else if (days <= 31) {
    // "Semana" e "Mes" = uma faixa por dia DECORRIDO do calendario, do inicio da
    // janela ate hoje. Sao dias de calendario (nao blocos de 86400000ms) para o
    // rotulo bater com a data mesmo na virada do horario de verao, e sao so os
    // decorridos: faixa futura vazia desenharia a curva morrendo no meio do card.
    const cursor = new Date(windowStart)
    while (cursor.getTime() <= now) {
      const start = cursor.getTime()
      const next = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1).getTime()
      buckets.push({ start, end: next, label: `${pad2(cursor.getDate())}/${pad2(cursor.getMonth() + 1)}` })
      cursor.setTime(next)
    }
  } else {
    // Janela deslizante longa (nao vem do seletor): agrupa em no maximo 30
    // faixas para a curva nao virar ruido.
    const slots = Math.min(days, 30)
    const width = (days * 86400000) / slots
    for (let i = 0; i < slots; i++) {
      const start = windowStart + i * width
      const d = new Date(start)
      buckets.push({ start, end: start + width, label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` })
    }
  }

  if (buckets.length === 0) {
    buckets.push({ start: now, end: Number.POSITIVE_INFINITY, label: '' })
  }
  buckets[buckets.length - 1].end = Number.POSITIVE_INFINITY

  return buckets
}

export interface DashboardKpis {
  conversionRate: number
  avgAiScore: number
  dealsClosed: number
  totalLeads: number
  totalDeals: number
  openCount: number
  closedCount: number
  lostCount: number
  pendingCount: number
  archivedCount: number
  openValue: number
  closedValue: number
  lostValue: number
  totalValue: number
  avgTicket: number
  prevConversionRate: number
  prevAvgAiScore: number
  prevDealsClosed: number
  trend: KpiTrendPoint[]
}

export const getDashboardKpis = async (companyId: string, days?: number, pipelineId?: string, sellerProfileId?: string): Promise<DashboardKpis> => {
  // Deals: buscar com created_at E closed_at para filtrar por periodo no JS.
  // Abertos filtram por created_at, fechados/perdidos por closed_at.
  const allDeals = await fetchDealsForMetrics(companyId, pipelineId, sellerProfileId)

  const leadIdsInPipeline = pipelineId ? await getLeadIdsInPipeline(companyId, pipelineId) : null

  // Um unico "agora" para o recorte e para as faixas da curva. Duas chamadas a
  // Date.now() deslocariam as faixas alguns milissegundos em relacao a janela do
  // KPI, e registros da borda cairiam fora da curva sem cair fora do numero.
  const now = Date.now()

  // Janela do periodo, uma unica vez: o recorte dos contatos abaixo, o dos
  // negocios (`inPeriod`) e as faixas da curva (`buildTrendBuckets`) usam este
  // mesmo inicio. Ver `periodStartMs` para por que os tres tem que andar juntos.
  const windowStart = periodStartMs(days, now)
  const windowStartIso = windowStart === null ? null : new Date(windowStart).toISOString()

  // Leads query for ai_score + total count
  const leads = await fetchAllRows<{ id: string; ai_score: number | null; created_at: string }>((from, to) => {
    let q = veltzy().from('leads').select('id, ai_score, created_at').eq('company_id', companyId)
    if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
    if (windowStartIso) q = q.gte('created_at', windowStartIso)
    return q.order('id').range(from, to)
  })

  const allLeads = onlyInPipeline(leads, leadIdsInPipeline)
  const totalLeads = allLeads.length

  // Filtro de periodo por status:
  // - open/pending: created_at (entraram no funil no periodo)
  // - won/lost: closed_at (fechados no periodo)
  // - archived: created_at
  // - Sem periodo (Total): mostra tudo
  const inPeriod = (dateStr: string | null) => {
    if (!windowStartIso) return true
    if (!dateStr) return false
    return dateStr >= windowStartIso
  }

  const open = allDeals.filter((d) => d.status === 'open' && inPeriod(dealRefDate(d)))
  const closed = allDeals.filter((d) => d.status === 'won' && inPeriod(dealRefDate(d)))
  const lost = allDeals.filter((d) => d.status === 'lost' && inPeriod(dealRefDate(d)))
  const pending = allDeals.filter((d) => d.status === 'pending_assignment' && inPeriod(dealRefDate(d)))
  const archived = allDeals.filter((d) => d.status === 'archived' && inPeriod(dealRefDate(d)))
  const totalDeals = open.length + closed.length + lost.length + pending.length + archived.length

  const sumVal = (arr: typeof allDeals) => arr.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const openValue = sumVal(open)
  const closedValue = sumVal(closed)
  const lostValue = sumVal(lost)
  const totalValue = openValue + closedValue + lostValue

  const avgScore = totalLeads > 0 ? Math.round(allLeads.reduce((s, l) => s + (l.ai_score ?? 0), 0) / totalLeads) : 0
  const conversionRate = totalDeals > 0 ? Math.round((closed.length / totalDeals) * 100) : 0
  const avgTicket = closed.length > 0 ? closedValue / closed.length : 0

  // Curva dos cards de KPI: os mesmos registros que produzem os numeros acima,
  // agora distribuidos no tempo. Nao ha consulta nova, so redistribuicao, entao
  // a curva nao pode discordar do card.
  const periodDeals = [...open, ...closed, ...lost, ...pending, ...archived]
  const dealStamps = periodDeals.map((d) => ({ ts: new Date(dealRefDate(d)).getTime(), won: d.status === 'won' }))
  const leadStamps = allLeads.map((l) => ({ ts: new Date(l.created_at).getTime(), score: l.ai_score ?? 0 }))

  const stamps = [...dealStamps.map((d) => d.ts), ...leadStamps.map((l) => l.ts)].filter((t) => Number.isFinite(t))
  const earliest = stamps.length > 0 ? Math.min(...stamps) : now
  const buckets = buildTrendBuckets(days, now, earliest)

  const acc = buckets.map(() => ({ deals: 0, won: 0, leads: 0, scoreSum: 0 }))
  const indexOfBucket = (ts: number) => {
    if (!Number.isFinite(ts)) return -1
    for (let i = 0; i < buckets.length; i++) {
      if (ts >= buckets[i].start && ts < buckets[i].end) return i
    }
    return -1
  }

  dealStamps.forEach((d) => {
    const i = indexOfBucket(d.ts)
    if (i < 0) return
    acc[i].deals++
    if (d.won) acc[i].won++
  })

  leadStamps.forEach((l) => {
    const i = indexOfBucket(l.ts)
    if (i < 0) return
    acc[i].leads++
    acc[i].scoreSum += l.score
  })

  const trend: KpiTrendPoint[] = buckets.map((b, i) => ({
    label: b.label,
    conversionRate: acc[i].deals > 0 ? Math.round((acc[i].won / acc[i].deals) * 100) : null,
    avgAiScore: acc[i].leads > 0 ? Math.round(acc[i].scoreSum / acc[i].leads) : null,
    dealsClosed: acc[i].won,
  }))

  let prevConversionRate = 0
  let prevAvgAiScore = 0
  let prevDealsClosed = 0
  if (days) {
    // Periodo anterior com a MESMA semantica do atual, senao a variacao compara
    // recortes diferentes. Ver `previousPeriodRange`: "Hoje" compara com ontem
    // inteiro, "Semana" e "Mes" com o trecho equivalente do periodo anterior.
    // Nao e nulo aqui porque `days` existe.
    const prev = previousPeriodRange(days, now)!
    const prevStart = new Date(prev.start)
    const prevEnd = new Date(prev.end)

    const prevLeads = await fetchAllRows<{ id: string; ai_score: number | null }>((from, to) => {
      let q = veltzy()
        .from('leads')
        .select('id, ai_score')
        .eq('company_id', companyId)
        .gte('created_at', prevStart.toISOString())
        .lt('created_at', prevEnd.toISOString())
      if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
      return q.order('id').range(from, to)
    })

    let prevDealsQuery = veltzy()
      .from('deals')
      .select('status')
      .eq('company_id', companyId)
      .gte('created_at', prevStart.toISOString())
      .lt('created_at', prevEnd.toISOString())
    if (pipelineId) prevDealsQuery = prevDealsQuery.eq('pipeline_id', pipelineId)
    if (sellerProfileId) prevDealsQuery = prevDealsQuery.eq('assigned_to', sellerProfileId)
    const { data: prevDeals, error: prevDealsError } = await prevDealsQuery
    if (prevDealsError) throw prevDealsError

    const pLeads = onlyInPipeline(prevLeads, leadIdsInPipeline)
    const pDeals = prevDeals ?? []
    const pClosed = pDeals.filter((d) => d.status === 'won')
    prevConversionRate = pDeals.length > 0 ? Math.round((pClosed.length / pDeals.length) * 100) : 0
    prevAvgAiScore = pLeads.length > 0 ? Math.round(pLeads.reduce((s, l) => s + (l.ai_score ?? 0), 0) / pLeads.length) : 0
    prevDealsClosed = pClosed.length
  }

  return {
    conversionRate,
    avgAiScore: avgScore,
    dealsClosed: closed.length,
    totalLeads,
    totalDeals,
    openCount: open.length,
    closedCount: closed.length,
    lostCount: lost.length,
    pendingCount: pending.length,
    archivedCount: archived.length,
    openValue,
    closedValue,
    lostValue,
    totalValue,
    avgTicket,
    prevConversionRate,
    prevAvgAiScore,
    prevDealsClosed,
    trend,
  }
}

export const getLeadsBySource = async (companyId: string, days?: number, pipelineId?: string, sellerProfileId?: string): Promise<SourceMetrics[]> => {
  const leadIdsInPipeline = pipelineId ? await getLeadIdsInPipeline(companyId, pipelineId) : null

  const startIso = periodStartIso(days)
  const leads = await fetchAllRows<{ id: string; source_id: string | null }>((from, to) => {
    let q = veltzy().from('leads').select('id, source_id').eq('company_id', companyId)
    if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
    if (startIso) q = q.gte('created_at', startIso)
    return q.order('id').range(from, to)
  })

  const { data: sources, error: sourcesError } = await veltzy().from('lead_sources').select('id, name, color').eq('company_id', companyId)
  if (sourcesError) throw sourcesError

  const counts: Record<string, number> = {}
  onlyInPipeline(leads, leadIdsInPipeline).forEach((l) => { if (l.source_id) counts[l.source_id] = (counts[l.source_id] ?? 0) + 1 })

  return (sources ?? []).map((s) => ({ source_id: s.id, name: s.name, color: s.color, count: counts[s.id] ?? 0 })).filter((s) => s.count > 0)
}

export const getPipelineOverview = async (companyId: string, days?: number, pipelineId?: string, sellerProfileId?: string): Promise<StageMetrics[]> => {
  let stagesQuery = veltzy().from('pipeline_stages').select('id, name, color, position, is_final').eq('company_id', companyId).order('position')
  if (pipelineId) stagesQuery = stagesQuery.eq('pipeline_id', pipelineId)
  const { data: stages, error: stagesError } = await stagesQuery
  if (stagesError) throw stagesError

  let dealsQuery = veltzy().from('deals').select('stage_id, value').eq('company_id', companyId).in('status', ['open', 'pending_assignment'])
  if (pipelineId) dealsQuery = dealsQuery.eq('pipeline_id', pipelineId)
  if (sellerProfileId) dealsQuery = dealsQuery.eq('assigned_to', sellerProfileId)
  const startIso = periodStartIso(days)
  if (startIso) dealsQuery = dealsQuery.gte('created_at', startIso)
  const { data: deals, error: dealsError } = await dealsQuery
  if (dealsError) throw dealsError

  const map: Record<string, { count: number; value: number }> = {}
  deals?.forEach((d) => {
    if (!d.stage_id) return
    if (!map[d.stage_id]) map[d.stage_id] = { count: 0, value: 0 }
    map[d.stage_id].count++
    map[d.stage_id].value += Number(d.value) || 0
  })

  return (stages ?? []).map((s) => ({
    stage_id: s.id, name: s.name, color: s.color, position: s.position,
    count: map[s.id]?.count ?? 0, value: map[s.id]?.value ?? 0,
    is_final: s.is_final,
  }))
}

export const getMonthlyComparison = async (companyId: string, days?: number, pipelineId?: string, sellerProfileId?: string): Promise<MonthlyData[]> => {
  const monthsBack = days && days <= 30 ? 3 : 6
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - monthsBack)
  const startIso = startDate.toISOString()

  const leadIdsInPipeline = pipelineId ? await getLeadIdsInPipeline(companyId, pipelineId) : null

  // Leads per month (total incoming)
  const leads = await fetchAllRows<{ id: string; created_at: string }>((from, to) => {
    let q = veltzy().from('leads').select('id, created_at').eq('company_id', companyId).gte('created_at', startIso)
    if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
    return q.order('id').range(from, to)
  })

  // Won deals per month, pelo mes em que FECHARAM (`dealRefDate`).
  const allDeals = await fetchDealsForMetrics(companyId, pipelineId, sellerProfileId)
  const deals = allDeals.filter((d) => d.status === 'won' && dealInWindow(d, startIso))

  const months: Record<string, { leads: number; deals: number }> = {}

  onlyInPipeline(leads, leadIdsInPipeline).forEach((l) => {
    const d = new Date(l.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!months[key]) months[key] = { leads: 0, deals: 0 }
    months[key].leads++
  })

  deals.forEach((deal) => {
    const d = new Date(dealRefDate(deal))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!months[key]) months[key] = { leads: 0, deals: 0 }
    months[key].deals++
  })

  return Object.entries(months).sort().map(([month, data]) => ({
    month: new Date(month + '-01').toLocaleDateString('pt-BR', { month: 'short' }),
    ...data,
  }))
}

export interface MonthlyGridData {
  month: string
  leads: number
  conversion: number
  deals: number
  value: number
}

export const getMonthlyComparisonGrid = async (companyId: string, months = 6, pipelineId?: string, sellerProfileId?: string): Promise<MonthlyGridData[]> => {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)
  const startIso = startDate.toISOString()

  const leadIdsInPipeline = pipelineId ? await getLeadIdsInPipeline(companyId, pipelineId) : null

  // Leads per month
  const leads = await fetchAllRows<{ id: string; created_at: string }>((from, to) => {
    let q = veltzy().from('leads').select('id, created_at').eq('company_id', companyId).gte('created_at', startIso)
    if (sellerProfileId) q = q.eq('assigned_to', sellerProfileId)
    return q.order('id').range(from, to)
  })

  // Won deals per month with value, pelo mes em que FECHARAM (`dealRefDate`).
  const allDeals = await fetchDealsForMetrics(companyId, pipelineId, sellerProfileId)
  const deals = allDeals.filter((d) => d.status === 'won' && dealInWindow(d, startIso))

  // Generate all months in period
  const allMonths: string[] = []
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const now = new Date()
  while (cursor <= now) {
    allMonths.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const buckets: Record<string, { leads: number; deals: number; value: number }> = {}
  allMonths.forEach((key) => {
    buckets[key] = { leads: 0, deals: 0, value: 0 }
  })

  onlyInPipeline(leads, leadIdsInPipeline).forEach((l) => {
    const d = new Date(l.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!buckets[key]) buckets[key] = { leads: 0, deals: 0, value: 0 }
    buckets[key].leads++
  })

  deals.forEach((deal) => {
    const d = new Date(dealRefDate(deal))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!buckets[key]) buckets[key] = { leads: 0, deals: 0, value: 0 }
    buckets[key].deals++
    buckets[key].value += Number(deal.value) || 0
  })

  return allMonths.map((month) => {
    const data = buckets[month]
    const [y, m] = month.split('-')
    const label = `${MONTH_NAMES_PT[Number(m) - 1]}/${y.slice(2)}`
    return {
      month: label,
      leads: data.leads,
      conversion: data.leads > 0 ? Math.round((data.deals / data.leads) * 100) : 0,
      deals: data.deals,
      value: data.value,
    }
  })
}

export interface HistoricalConversionRate {
  stage_id: string
  stage_name: string
  position: number
  entered: number
  advanced: number
  rate: number
}

export const getHistoricalConversionRates = async (companyId: string, days = 90, pipelineId?: string, sellerProfileId?: string): Promise<HistoricalConversionRate[]> => {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  let stagesQuery = veltzy()
    .from('pipeline_stages')
    .select('id, name, position, is_final')
    .eq('company_id', companyId)
    .order('position')
  if (pipelineId) stagesQuery = stagesQuery.eq('pipeline_id', pipelineId)
  const { data: stages, error: stagesError } = await stagesQuery
  if (stagesError) throw stagesError

  let dealsQuery = veltzy()
    .from('deals')
    .select('stage_id, status, created_at, updated_at')
    .eq('company_id', companyId)
    .gte('created_at', startDate.toISOString())
  if (pipelineId) dealsQuery = dealsQuery.eq('pipeline_id', pipelineId)
  if (sellerProfileId) dealsQuery = dealsQuery.eq('assigned_to', sellerProfileId)
  const { data: deals, error: dealsError } = await dealsQuery
  if (dealsError) throw dealsError

  const nonFinalStages = (stages ?? []).filter((s) => !s.is_final)
  const stagePositions = new Map((stages ?? []).map((s) => [s.id, s.position]))

  const entered: Record<string, number> = {}
  const advanced: Record<string, number> = {}

  ;(deals ?? []).forEach((deal) => {
    const pos = stagePositions.get(deal.stage_id)
    nonFinalStages.forEach((stage) => {
      if (stage.position <= (pos ?? -1)) {
        entered[stage.id] = (entered[stage.id] ?? 0) + 1
      }
      if (stage.position < (pos ?? -1)) {
        advanced[stage.id] = (advanced[stage.id] ?? 0) + 1
      }
    })
  })

  return nonFinalStages.map((stage) => {
    const e = entered[stage.id] ?? 0
    const a = advanced[stage.id] ?? 0
    return {
      stage_id: stage.id,
      stage_name: stage.name,
      position: stage.position,
      entered: e,
      advanced: a,
      rate: e > 0 ? Math.round((a / e) * 100) : 0,
    }
  })
}

export const getSellerPerformance = async (companyId: string, days?: number, pipelineId?: string, sellerProfileId?: string): Promise<SellerMetrics[]> => {
  let profilesQuery = supabase.from('profiles').select('id, name, is_available').eq('company_id', companyId)
  if (sellerProfileId) profilesQuery = profilesQuery.eq('id', sellerProfileId)
  const { data: profiles, error: profilesError } = await profilesQuery
  if (profilesError) throw profilesError

  const startIso = periodStartIso(days)
  const allDeals = await fetchDealsForMetrics(companyId, pipelineId, sellerProfileId)
  const deals = startIso ? allDeals.filter((d) => dealInWindow(d, startIso)) : allDeals

  const { data: responseTimes, error: rpcError } = await supabase.rpc('get_seller_avg_response_times', {
    _company_id: companyId,
    ...(startIso ? { _start_date: startIso } : {}),
  })
  if (rpcError) {
    console.warn('[Dashboard] Falha ao buscar tempos de resposta:', rpcError.message)
  }

  const responseMap: Record<string, number> = {}
  ;(responseTimes ?? []).forEach((r: { user_id: string; avg_response_seconds: number }) => {
    responseMap[r.user_id] = Math.round(r.avg_response_seconds / 60) // convertendo pra minutos
  })


  return (profiles ?? []).map((p) => {
    const myDeals = deals.filter((d) => d.assigned_to === p.id)
    const won = myDeals.filter((d) => d.status === 'won')
    return {
      profile_id: p.id,
      name: p.name,
      leads_count: myDeals.length,
      deals_count: won.length,
      conversion_rate: myDeals.length > 0 ? Math.round((won.length / myDeals.length) * 1000) / 10 : 0,
      avg_response_minutes: responseMap[p.id] ?? null,
      is_available: p.is_available,
    }
  })
}
