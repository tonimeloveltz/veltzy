import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardDeals } from '@/hooks/use-deals'
import { useDashboardStages } from '@/hooks/use-dashboard-stages'
import { useHistoricalConversionRates } from '@/hooks/use-dashboard-metrics'
import { useGoals } from '@/hooks/use-goals'
import { calculateForecast } from '@/lib/forecast'

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)

const ForecastCard = ({ pipelineId }: { pipelineId?: string | null }) => {
  const { data: deals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)
  const { data: stages, isLoading: stagesLoading } = useDashboardStages(pipelineId)
  const { data: rates, isLoading: ratesLoading } = useHistoricalConversionRates(90, pipelineId)
  const { data: goals, isLoading: goalsLoading } = useGoals()

  const isLoading = dealsLoading || stagesLoading || ratesLoading || goalsLoading

  const forecast = useMemo(() => {
    if (!deals || !stages || !rates) return null
    return calculateForecast(deals, stages, rates)
  }, [deals, stages, rates])

  const revenueGoal = useMemo(() => {
    if (!goals) return null
    const now = new Date()
    const activeGoal = goals.find((g) => {
      if (!g.is_active) return false
      return new Date(g.start_date) <= now && new Date(g.end_date) >= now
    })
    if (!activeGoal?.goal_metrics) return null
    const revenueMetric = activeGoal.goal_metrics.find((m) => m.metric_type === 'revenue')
    return revenueMetric?.target_value ?? null
  }, [goals])

  const progressPercent = revenueGoal && forecast
    ? Math.min(Math.round((forecast.total / revenueGoal) * 100), 100)
    : null

  if (isLoading) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <Skeleton className="h-5 w-36 mb-1" />
        <Skeleton className="h-3 w-52 mb-5" />
        <Skeleton className="h-10 w-40 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
    )
  }

  return (
    <div className="bg-card border border-border/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-0.5">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Previsão do Mês</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Estimativa baseada nos últimos 90 dias
      </p>

      <p className="text-2xl font-bold text-foreground">
        {fmt(forecast?.total ?? 0)}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        estimativa baseada nos últimos 90 dias
      </p>

      {revenueGoal != null && progressPercent != null && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progresso vs meta</span>
            <span className={cn(
              'font-medium',
              progressPercent >= 80 ? 'text-primary' : progressPercent >= 50 ? 'text-yellow-500' : 'text-red-500'
            )}>
              {progressPercent}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                progressPercent >= 80 ? 'bg-primary' : progressPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Previsto: {fmt(forecast?.total ?? 0)}</span>
            <span>Meta: {fmt(revenueGoal)}</span>
          </div>
        </div>
      )}

      {forecast && forecast.byStage.length > 0 && (
        <div className="mt-4 border-t border-border/30 pt-3 space-y-1.5">
          {forecast.byStage.map((s) => (
            <div key={s.stage_id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {s.stage_name} <span className="text-muted-foreground/50">({s.leads_count})</span>
              </span>
              <span className="font-medium text-foreground tabular-nums">{fmt(s.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { ForecastCard }
