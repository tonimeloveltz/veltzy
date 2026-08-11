import { Bot } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useSalesPulse } from '@/hooks/use-sales-pulse'
import { CopilotAiContent } from '@/components/dashboard/copilot-ai-content'
import { CopilotLocalTips } from '@/components/dashboard/copilot-local-tips'

/**
 * Card hibrido do Copiloto no dashboard.
 * - Empresa COM acesso de IA e payload valido -> conteudo IA (sales-pulse via gateway).
 * - SEM acesso (403), erro de rede/servidor ou sem dados -> fallback heuristico local.
 * O card nunca some: sempre ha IA ou heuristica.
 */
const CopilotCard = ({ pipelineId }: { pipelineId?: string | null }) => {
  const { data: pulse, isLoading: pulseLoading } = useSalesPulse()

  return (
    <div className="bg-card border border-border/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15">
          <Bot className="h-4 w-4 text-purple-600" />
        </div>
        <h3 className="text-sm font-semibold">Copiloto</h3>
      </div>

      {pulseLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : pulse ? (
        <CopilotAiContent data={pulse} />
      ) : (
        <CopilotLocalTips pipelineId={pipelineId} />
      )}
    </div>
  )
}

export { CopilotCard }
