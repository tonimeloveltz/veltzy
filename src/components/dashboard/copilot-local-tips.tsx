import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardLeads } from '@/hooks/use-dashboard-leads'
import { useDashboardStages } from '@/hooks/use-dashboard-stages'
import { useDashboardDeals } from '@/hooks/use-deals'
import { buildActiveDealInfo } from '@/lib/active-deal-info'
import { buildCopilotTips, type CopilotTipPriority } from '@/lib/copilot-tips'

const PRIORITY_ICON_CLASS: Record<CopilotTipPriority, string> = {
  alta: 'text-red-500',
  media: 'text-blue-500',
  baixa: 'text-muted-foreground',
}

/**
 * Fallback heuristico do Copiloto: dicas calculadas localmente sobre os dados do
 * dashboard (sem IA). Usado quando a empresa nao tem acesso de IA ou a chamada
 * ao gateway falha. Comportamento identico ao card original pre-hibrido.
 */
const CopilotLocalTips = ({ pipelineId }: { pipelineId?: string | null }) => {
  const navigate = useNavigate()
  const { data: leads, isLoading: leadsLoading } = useDashboardLeads(pipelineId)
  const { data: stages, isLoading: stagesLoading } = useDashboardStages(pipelineId)
  const { data: deals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)

  const tips = useMemo(() => {
    if (!leads || !stages || !deals) return []
    return buildCopilotTips(leads, stages, buildActiveDealInfo(deals))
  }, [leads, stages, deals])

  const isLoading = leadsLoading || stagesLoading || dealsLoading

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
      </div>
    )
  }

  if (tips.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <p className="text-xs text-muted-foreground">Tudo em dia</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {tips.map((tip) => (
        <button
          key={tip.key}
          onClick={() => navigate(tip.navigateTo)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-smooth',
            'bg-purple-500/5 border border-purple-500/10 hover:bg-purple-500/10',
          )}
        >
          <tip.icon className={cn('h-3.5 w-3.5 shrink-0', PRIORITY_ICON_CLASS[tip.priority])} />
          <span className="flex-1 min-w-0 text-xs font-medium truncate">{tip.label}</span>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
            {tip.count}
          </span>
        </button>
      ))}
    </div>
  )
}

export { CopilotLocalTips }
