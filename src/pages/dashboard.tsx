import { useState } from 'react'
import {
  AlertCircle, ArrowUp, ArrowDown, Building2, Clock, Calendar, CalendarDays, BarChart3,
  TrendingUp, Target, DollarSign, Users, Equal,
} from 'lucide-react'
import {
  ComposedChart, Line, Area, Bar, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth.store'
import { useDashboardKpis, useMonthlyComparisonGrid } from '@/hooks/use-dashboard-metrics'
import type { MonthlyGridData } from '@/services/dashboard.service'
import { useDashboardRealtime } from '@/hooks/use-dashboard-realtime'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { PipelineFilter } from '@/components/shared/pipeline-filter'
import { calculatePeriodChange } from '@/lib/dashboard-utils'
import { LeadsBySourceChart } from '@/components/dashboard/leads-by-source-chart'
import { TeamHighlightCard } from '@/components/dashboard/team-highlight-card'
import { SellerPerformanceTable } from '@/components/dashboard/seller-performance-table'
import { MonthlyComparisonGrid } from '@/components/dashboard/monthly-comparison-grid'
import { MetricsLineChart } from '@/components/dashboard/metrics-line-chart'
import { BottleneckDetector } from '@/components/dashboard/bottleneck-detector'
import { ForecastCard } from '@/components/dashboard/forecast-card'
import { CopilotCard } from '@/components/dashboard/copilot-card'

const periodOptions = [
  { label: 'Hoje', icon: Clock, days: 1 },
  { label: 'Semana', icon: Calendar, days: 7 },
  { label: 'Mês', icon: CalendarDays, days: 30 },
  { label: 'Total', icon: BarChart3, days: undefined },
] as const

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface KpiTrendProps {
  data: MonthlyGridData[]
  dataKey: keyof MonthlyGridData
  variant?: 'line' | 'bar'
}

const KpiTrend = ({ data, dataKey, variant = 'line' }: KpiTrendProps) => {
  const values = data.map((d) => d[dataKey])

  // Uma minitendencia so significa algo com pelo menos dois pontos e alguma variacao:
  // serie toda zerada desenharia uma reta falsa no chao do card.
  // Reserva a mesma altura pra nao deslocar o layout.
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <div className="h-[80px] mt-4" aria-hidden /> //acho que nao precisa mais dessa verificação
  }

  return (
    <div className="h-[80px] mt-4 opacity-60">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <ComposedChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="kpiGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {variant === 'line' && (
            <Area
              type="monotone"
              dataKey={dataKey}
              fill="url(#kpiGradient)"
              stroke="none"
            />
          )}
          {variant === 'line' && (
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={false}
              filter="url(#glow)"
            />
          )}
          {variant === 'bar' && (
            <Bar
              dataKey={dataKey}
              fill="url(#kpiGradient)"
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// Retrato do valor atual (0-100%), nao a serie mensal: o anel preenche a fracao
// do dominio fixo [0, 100], entao 46% ocupa ~46% do circulo.
const PercentGauge = ({ value }: { value: number }) => {
  const safeValue = Math.min(Math.max(value, 0), 100)

  return (
    <div className="relative mx-auto mt-4 h-[120px] w-[150px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <RadialBarChart
          data={[{ value: safeValue }]}
          cx="50%"
          cy="50%"
          innerRadius="76%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
            axisLine={false}
          />
          <RadialBar
            dataKey="value"
            angleAxisId={0}
            background={{ fill: 'hsl(var(--muted))' }}
            fill="hsl(var(--primary))"
            cornerRadius={99}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-foreground">{Math.round(safeValue)}%</span>
      </div>
      {/* Percentual sobreposto ao centro: assumiu o lugar do numero grande do topo */}
    </div>
  )
}

interface BreakdownItem {
  value: string
  color: string
  dotColor: string
  label: string
}

const Breakdown = ({ items }: { items: BreakdownItem[] }) => (
  <>
    <div className="border-t border-border/30 my-3" />
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', item.dotColor)} />
            {item.label}
          </span>
          <span className={cn('text-xs font-medium', item.color)}>{item.value}</span>
        </div>
      ))}
    </div>
  </>
)

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
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
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
  // Mesmo range/pipeline do Comparativo Mensal, pra minitendencia bater com o bloco de baixo
  const { data: monthlySeries } = useMonthlyComparisonGrid(monthlyRange, selectedPipelineId)
  useDashboardRealtime()

  const trendData = monthlySeries ?? []

  const displayName = profile?.name || company?.name || 'usuario'

  const cardBase = 'bg-card border border-border/30 rounded-2xl p-5'

  return (
    <div className="min-h-full p-6">
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
          <div className="flex items-center gap-3">
            <PipelineFilter
              value={selectedPipelineId}
              onChange={setSelectedPipelineId}
              pipelines={pipelines ?? []}
            />
            <span className="text-sm text-muted-foreground">Exibir:</span>
            <div className="flex gap-1.5">
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
              <PercentGauge value={kpis?.conversionRate ?? 0} />
              <div className="flex flex-col items-center gap-2 mt-4">
                <p className="text-sm text-muted-foreground">Leads convertidos em deals</p>
                {selectedDays && <VariationBadge current={kpis?.conversionRate ?? 0} previous={kpis?.prevConversionRate ?? 0} />}
              </div>
            </div>

            {/* Score Medio IA */}
            <div className={cardBase}>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Score Médio IA</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <Target className="h-5 w-5 text-primary" />
                </div>
              </div>
              <PercentGauge value={kpis?.avgAiScore ?? 0} />
              <div className="flex flex-col items-center gap-2 mt-4">
                <p className="text-sm text-muted-foreground">Qualificação média dos leads</p>
                {selectedDays && <VariationBadge current={kpis?.avgAiScore ?? 0} previous={kpis?.prevAvgAiScore ?? 0} />}
              </div>
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
              {/* <KpiTrend data={trendData} dataKey="deals" variant="bar" /> */}
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

        {/* INTELIGENCIA: GARGALOS + PREVISAO + COPILOTO */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BottleneckDetector pipelineId={selectedPipelineId} />
          <ForecastCard pipelineId={selectedPipelineId} />
          <CopilotCard pipelineId={selectedPipelineId} />
        </div>

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
