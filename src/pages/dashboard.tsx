import { useState } from 'react'
import {
  AlertCircle, ArrowUp, ArrowDown, Building2, Clock, Calendar, CalendarDays, BarChart3,
  TrendingUp, Target, DollarSign, Users, Equal,
} from 'lucide-react'
import { ComposedChart, Line, Area, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth.store'
import { useDashboardKpis } from '@/hooks/use-dashboard-metrics'
import { useDashboardRealtime } from '@/hooks/use-dashboard-realtime'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { PipelineFilter } from '@/components/shared/pipeline-filter'
import { Breakdown } from '@/components/shared/breakdown'
import { calculatePeriodChange } from '@/lib/dashboard-utils'
import { LeadsBySourceChart } from '@/components/dashboard/leads-by-source-chart'
import { TeamHighlightCard } from '@/components/dashboard/team-highlight-card'
import { SellerPerformanceTable } from '@/components/dashboard/seller-performance-table'
import { MonthlyComparisonGrid } from '@/components/dashboard/monthly-comparison-grid'
import { MetricsLineChart } from '@/components/dashboard/metrics-line-chart'
import { BottleneckDetector } from '@/components/dashboard/bottleneck-detector'
import { ForecastCard } from '@/components/dashboard/forecast-card'
import { CopilotCard } from '@/components/dashboard/copilot-card'
import type { KpiTrendPoint } from '@/services/dashboard.service'

const periodOptions = [
  { label: 'Hoje', icon: Clock, days: 1 },
  { label: 'Semana', icon: Calendar, days: 7 },
  { label: 'Mês', icon: CalendarDays, days: 30 },
  { label: 'Total', icon: BarChart3, days: undefined },
] as const

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

type TrendKey = 'conversionRate' | 'avgAiScore' | 'dealsClosed'

const SparklineTooltip = ({ active, payload, format }: {
  active?: boolean
  payload?: Array<{ value: number | null; payload: KpiTrendPoint }>
  format: (v: number) => string
}) => {
  const point = payload?.[0]
  if (!active || !point) return null
  return (
    <div className="glass-card rounded-lg px-2.5 py-1.5 shadow-lg">
      <p className="text-[10px] text-muted-foreground">{point.payload.label}</p>
      <p className="text-xs font-semibold text-foreground">
        {point.value === null ? 'Sem dados' : format(point.value)}
      </p>
    </div>
  )
}

/**
 * Mesma curva de antes, agora alimentada pelo periodo selecionado.
 *
 * Os pontos vem do mesmo `getDashboardKpis` que produz o numero grande do card,
 * so que distribuidos no tempo, entao a curva sempre fecha com o numero.
 * Faixa sem registro chega como `null` e nao como zero: `connectNulls` passa por
 * cima do buraco em vez de desenhar um vale que nao aconteceu.
 */
const KpiSparkline = ({ data, dataKey, format }: {
  data: KpiTrendPoint[] | undefined
  dataKey: TrendKey
  format: (v: number) => string
}) => {
  const points = data ?? []
  // Apara as faixas nulas das DUAS PONTAS, por dataKey. `connectNulls` so
  // atravessa buraco ENTRE dois valores: nulo na ponta nao tem o que ligar do
  // lado de fora, entao a serie comecava (ou terminava) no meio da largura e a
  // Area aparecia com um corte vertical. Acontece em "Total", onde a empresa tem
  // contato num mes sem nenhum negocio e a taxa daquele mes vem nula.
  //
  // Nulo do MEIO continua nulo de proposito, atravessado pelo `connectNulls`.
  // Trocar nulo por zero desenharia um vale que nao aconteceu, que e justamente
  // o motivo de o nulo existir (ver `KpiTrendPoint` em dashboard.service.ts).
  //
  // Isso nao fere o invariante de soma da curva: faixa nula nao contribui com
  // nada, entao aparar as pontas nao muda o que a curva soma. E recorte de
  // exibicao, nao de dado, e por isso vive aqui e nao em `buildTrendBuckets`.
  const first = points.findIndex((p) => p[dataKey] !== null)
  const last = points.findLastIndex((p) => p[dataKey] !== null)
  const series = first < 0 ? [] : points.slice(first, last + 1)
  const hasValue = series.length > 0
  // Uma faixa sozinha nao desenha linha: um segmento precisa de dois pontos, e
  // com `dot={false}` o card fica em branco mesmo tendo dado (acontece em
  // "Hoje", onde quase toda hora do dia costuma vir vazia, e de madrugada onde o
  // dia inteiro cabe em uma faixa so). Nesse caso o ponto solitario vira bolinha
  // para o card nao mentir.
  const lonePoint = series.length === 1

  if (!hasValue) {
    return (
      <div className="h-[80px] mt-4 flex items-end justify-center pb-3">
        <span className="text-xs text-muted-foreground/70">Sem dados no período</span>
      </div>
    )
  }

  return (
    <div className="h-[80px] mt-4 opacity-60">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        {/* Margem >= raio do dot (r=3) nos quatro lados: sem ela a bolinha do
            ponto solitario nasce colada na borda da area de plotagem e sai
            cortada pela metade, no topo quando o valor bate no maximo do
            dominio e nas laterais quando cai na primeira ou na ultima faixa. */}
        <ComposedChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={`kpiGradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
            </linearGradient>
            <filter id={`glow-${dataKey}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <Tooltip content={<SparklineTooltip format={format} />} cursor={false} />
          <Area
            type="monotone"
            dataKey={dataKey}
            connectNulls
            fill={`url(#kpiGradient-${dataKey})`}
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            connectNulls
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={lonePoint ? { r: 3, fill: 'hsl(var(--primary))', stroke: 'none' } : false}
            filter={`url(#glow-${dataKey})`}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

const pct = (v: number) => `${v}%`
const unit = (v: number) => String(v)

const VariationBadge = ({ current, previous }: { current: number; previous: number }) => {
  const { percentage, isPositive, isNeutral } = calculatePeriodChange(current, previous)
  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Equal className="h-3 w-3" />
      </span>
    )
  }
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
      isPositive ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-500'
    )}>
      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {percentage}%
    </span>
  )
}

const KpiCardSkeleton = ({ hasBreakdown = false }: { hasBreakdown?: boolean }) => (
  <div className="bg-card border border-border/30 rounded-2xl p-5">
    <div className="flex justify-between">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-10 rounded-lg" />
    </div>
    <Skeleton className="h-8 w-20 mt-3" />
    <Skeleton className="h-3 w-36 mt-2" />
    {hasBreakdown ? (
      <>
        <div className="border-t border-border/30 my-3" />
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </>
    ) : (
      <Skeleton className="h-[80px] w-full mt-4" />
    )}
  </div>
)

const DashboardPage = () => {
  const company = useAuthStore((s) => s.company)
  const profile = useAuthStore((s) => s.profile)
  const [selectedDays, setSelectedDays] = useState<number | undefined>(30)
  const [monthlyRange, setMonthlyRange] = useState(6)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const { data: pipelines } = useAccessiblePipelines()
  const { data: kpis, isLoading, isError, refetch } = useDashboardKpis(selectedDays, selectedPipelineId)
  useDashboardRealtime()

  const displayName = profile?.name || company?.name || 'usuario'

  const cardBase = 'bg-card border border-border/30 rounded-2xl p-5'

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="space-y-8 animate-fade-in">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Olá, {displayName}!
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Painel de gestão {company?.name ? `de ${company.name}` : ''}
              </p>
            </div>
          </div>

          {/* SELETOR DE PERIODO + PIPELINE */}
          <div className="flex flex-wrap items-center gap-3">
            <PipelineFilter
              value={selectedPipelineId}
              onChange={setSelectedPipelineId}
              pipelines={pipelines ?? []}
            />
            <span className="text-sm text-muted-foreground">Exibir:</span>
            <div className="flex flex-wrap gap-1.5">
              {periodOptions.map((p) => {
                const active = selectedDays === p.days
                return (
                  <button
                    key={p.label}
                    onClick={() => setSelectedDays(p.days)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-smooth',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <p.icon className="h-4 w-4" />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* GRID KPI CARDS */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton hasBreakdown />
            <KpiCardSkeleton />
            <KpiCardSkeleton hasBreakdown />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 bg-card border border-border/30 rounded-2xl">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Erro ao carregar dados do dashboard</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* LINHA 1 - Cards com grafico decorativo */}

            {/* Taxa de Conversao */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Taxa de Conversão</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-3xl font-bold text-foreground">
                  {kpis?.conversionRate ?? 0}%
                </p>
                {selectedDays && <VariationBadge current={kpis?.conversionRate ?? 0} previous={kpis?.prevConversionRate ?? 0} />}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Leads convertidos em deals</p>
              <KpiSparkline data={kpis?.trend} dataKey="conversionRate" format={pct} />
            </div>

            {/* Score Medio IA */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Score Médio IA</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <Target className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-3xl font-bold text-foreground">
                  {kpis?.avgAiScore ?? 0}%
                </p>
                {selectedDays && <VariationBadge current={kpis?.avgAiScore ?? 0} previous={kpis?.prevAvgAiScore ?? 0} />}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Qualificação média dos leads</p>
              <KpiSparkline data={kpis?.trend} dataKey="avgAiScore" format={pct} />
            </div>

            {/* Deals Fechados */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Deals Fechados</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-3xl font-bold text-foreground">
                  {kpis?.dealsClosed ?? 0}
                </p>
                {selectedDays && <VariationBadge current={kpis?.dealsClosed ?? 0} previous={kpis?.prevDealsClosed ?? 0} />}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Negócios concluídos com sucesso</p>
              <KpiSparkline data={kpis?.trend} dataKey="dealsClosed" format={unit} />
            </div>

            {/* LINHA 2 - Cards com breakdown */}

            {/* Negocios */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Negócios</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mt-2">
                {kpis?.totalDeals ?? 0}
              </p>
              <Breakdown items={[
                { value: String(kpis?.openCount ?? 0), color: 'text-yellow-500', dotColor: 'bg-yellow-500', label: 'Aberto' },
                { value: String(kpis?.closedCount ?? 0), color: 'text-emerald-500', dotColor: 'bg-emerald-500', label: 'Fechado' },
                { value: String(kpis?.lostCount ?? 0), color: 'text-red-500', dotColor: 'bg-red-500', label: 'Perdido' },
                ...((kpis?.pendingCount ?? 0) > 0 ? [{ value: String(kpis?.pendingCount ?? 0), color: 'text-amber-500', dotColor: 'bg-amber-500', label: 'Sem dono' }] : []),
                ...((kpis?.archivedCount ?? 0) > 0 ? [{ value: String(kpis?.archivedCount ?? 0), color: 'text-muted-foreground', dotColor: 'bg-muted-foreground', label: 'Arquivado' }] : []),
              ]} />
            </div>

            {/* Ticket Medio */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Ticket Médio</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground mt-2">
                {fmt(kpis?.avgTicket ?? 0)}
              </p>
            </div>

            {/* Valor Total */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Valor Total</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold text-primary mt-2">
                {fmt(kpis?.totalValue ?? 0)}
              </p>
              <Breakdown items={[
                { value: fmt(kpis?.openValue ?? 0), color: 'text-yellow-500', dotColor: 'bg-yellow-500', label: 'Aberto' },
                { value: fmt(kpis?.closedValue ?? 0), color: 'text-emerald-500', dotColor: 'bg-emerald-500', label: 'Fechado' },
                { value: fmt(kpis?.lostValue ?? 0), color: 'text-red-500', dotColor: 'bg-red-500', label: 'Perdido' },
              ]} />
            </div>
          </div>
        )}

        {/* INTELIGENCIA: GARGALOS + PREVISAO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BottleneckDetector pipelineId={selectedPipelineId} />
          <ForecastCard pipelineId={selectedPipelineId} />
        </div>

        {/* COPILOTO DE VENDAS */}
        <CopilotCard pipelineId={selectedPipelineId} />

        {/* LEADS POR ORIGEM + EQUIPE EM DESTAQUE */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LeadsBySourceChart days={selectedDays} pipelineId={selectedPipelineId} />
          <TeamHighlightCard days={selectedDays} pipelineId={selectedPipelineId} />
        </div>

        {/* PERFORMANCE VENDEDORES */}
        <SellerPerformanceTable days={selectedDays} pipelineId={selectedPipelineId} />

        {/* COMPARATIVO MENSAL */}
        <MonthlyComparisonGrid months={monthlyRange} onMonthsChange={setMonthlyRange} pipelineId={selectedPipelineId} />

        {/* EVOLUCAO DAS METRICAS */}
        <MetricsLineChart months={monthlyRange} pipelineId={selectedPipelineId} />

      </div>
    </div>
  )
}

export default DashboardPage
