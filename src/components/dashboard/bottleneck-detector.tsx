import { useMemo } from 'react'
import { Activity, AlertCircle, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardDeals } from '@/hooks/use-deals'
import { useDashboardStages } from '@/hooks/use-dashboard-stages'
import { useHistoricalConversionRates } from '@/hooks/use-dashboard-metrics'
import type { DealWithLead, PipelineStage } from '@/types/database'
import type { HistoricalConversionRate } from '@/services/dashboard.service'

interface Insight {
  type: 'time' | 'conversion'
  icon: typeof AlertCircle
  iconColor: string
  bgColor: string
  title: string
  subtitle: string
}

const MIN_LEADS_FOR_ANALYSIS = 10

const detectBottlenecks = (
  deals: DealWithLead[],
  stages: PipelineStage[],
  rates: HistoricalConversionRate[],
): Insight[] => {
  const finalStageIds = new Set(stages.filter((s) => s.is_final).map((s) => s.id))
  const nonFinalStages = stages.filter((s) => !s.is_final)
  const activeDeals = deals.filter((d) => d.stage_id && !finalStageIds.has(d.stage_id) && d.status === 'open')

  if (activeDeals.length < MIN_LEADS_FOR_ANALYSIS) return []

  const now = Date.now()
  const stageAvgDays: { stage: PipelineStage; avgDays: number }[] = []

  for (const stage of nonFinalStages) {
    const stageDeals = activeDeals.filter((d) => d.stage_id === stage.id)
    if (stageDeals.length === 0) continue

    const totalDays = stageDeals.reduce((sum, d) => {
      const diff = (now - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      return sum + diff
    }, 0)

    stageAvgDays.push({ stage, avgDays: totalDays / stageDeals.length })
  }

  const insights: Insight[] = []

  if (stageAvgDays.length > 0) {
    const worst = stageAvgDays.reduce((a, b) => (a.avgDays > b.avgDays ? a : b))
    if (worst.avgDays >= 1) {
      insights.push({
        type: 'time',
        icon: AlertCircle,
        iconColor: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        title: `Leads estão travando em ${worst.stage.name}`,
        subtitle: `Tempo médio de ${Math.round(worst.avgDays)} dia${Math.round(worst.avgDays) !== 1 ? 's' : ''} nesta etapa`,
      })
    }
  }

  if (rates.length > 0) {
    const worstRate = rates
      .filter((r) => r.entered >= 5)
      .reduce<HistoricalConversionRate | null>(
        (a, b) => (!a || b.rate < a.rate ? b : a),
        null,
      )

    if (worstRate && worstRate.rate < 80) {
      insights.push({
        type: 'conversion',
        icon: TrendingDown,
        iconColor: 'text-red-500',
        bgColor: 'bg-red-500/10',
        title: `Taxa de conversão baixa em ${worstRate.stage_name}`,
        subtitle: `${worstRate.rate}% dos leads avançam desta etapa`,
      })
    }
  }

  return insights
}

const BottleneckDetector = ({ pipelineId }: { pipelineId?: string | null }) => {
  const { data: deals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)
  const { data: stages, isLoading: stagesLoading } = useDashboardStages(pipelineId)
  const { data: rates, isLoading: ratesLoading } = useHistoricalConversionRates(90, pipelineId)

  const isLoading = dealsLoading || stagesLoading || ratesLoading

  const insights = useMemo(() => {
    if (!deals || !stages || !rates) return []
    return detectBottlenecks(deals, stages, rates)
  }, [deals, stages, rates])

  const totalHistorical = (rates ?? []).reduce((sum, r) => sum + r.entered, 0)

  if (isLoading) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <Skeleton className="h-5 w-36 mb-1" />
        <Skeleton className="h-3 w-52 mb-5" />
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-0.5">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Análise do Pipeline</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Detecta automaticamente onde os leads estão travando
      </p>

      {totalHistorical < MIN_LEADS_FOR_ANALYSIS ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/20 p-4">
          <Activity className="h-5 w-5 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">
            Coletando dados para análise...
          </p>
        </div>
      ) : insights.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-primary/5 p-4">
          <Activity className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            Pipeline saudável! Nenhum gargalo detectado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.type}
              className="flex items-start gap-3 rounded-lg bg-muted/20 p-4"
            >
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', insight.bgColor)}>
                <insight.icon className={cn('h-4.5 w-4.5', insight.iconColor)} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{insight.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { BottleneckDetector }
