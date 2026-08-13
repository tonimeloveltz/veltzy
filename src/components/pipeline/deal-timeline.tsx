import { Loader2, UserPlus, ArrowRight, User, MessageSquare, DollarSign } from 'lucide-react'
import { useDealActivityLogs, useLeadActivityLogs } from '@/hooks/use-activity-logs'
import type { ActivityLog } from '@/types/database'

const actionConfig: Record<string, { icon: typeof UserPlus; label: string }> = {
  created: { icon: UserPlus, label: 'Negócio criado' },
  stage_changed: { icon: ArrowRight, label: 'Movido para' },
  assigned: { icon: User, label: 'Atribuído a' },
  message_sent: { icon: MessageSquare, label: 'Mensagem enviada' },
  status_changed: { icon: ArrowRight, label: 'Status alterado para' },
  value_changed: { icon: DollarSign, label: 'Valor alterado para' },
}

// As cinco chaves do CHECK de veltzy.deals.status. O fallback e para o valor cru:
// status novo no futuro degrada para ingles em vez de sumir da linha.
const statusLabels: Record<string, string> = {
  open: 'aberto',
  won: 'ganho',
  lost: 'perdido',
  archived: 'arquivado',
  pending_assignment: 'aguardando responsável',
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatActivityLabel = (log: ActivityLog, stages?: { id: string; name: string }[]) => {
  const meta = log.metadata ?? {}
  const config = actionConfig[log.action]
  if (!config) return log.action

  if (log.action === 'stage_changed' && meta.to_stage) {
    const stageName = stages?.find((s) => s.id === meta.to_stage)?.name ?? 'outra fase'
    return `${config.label} ${stageName}`
  }
  if (log.action === 'assigned' && meta.to) {
    return `${config.label} ${(meta.to_name as string) ?? 'outro vendedor'}`
  }
  if (log.action === 'status_changed' && meta.to_status) {
    const status = meta.to_status as string
    return `${config.label} ${statusLabels[status] ?? status}`
  }
  if (log.action === 'value_changed' && typeof meta.to_value === 'number') {
    return `${config.label} ${formatCurrency(meta.to_value)}`
  }
  return config.label
}

const formatActivityDate = (createdAt: string) =>
  new Date(createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const TimelineList = ({
  logs,
  stages,
}: {
  logs: ActivityLog[]
  stages?: { id: string; name: string }[]
}) => (
  <div className="space-y-0">
    {logs.map((log, idx) => {
      const config = actionConfig[log.action] ?? actionConfig.created
      const Icon = config.icon
      const isLast = idx === logs.length - 1

      return (
        <div key={log.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </div>
            {!isLast && <div className="w-px flex-1 bg-border/50" />}
          </div>
          <div className="pb-4 pt-0.5">
            <p className="text-sm font-medium">{formatActivityLabel(log, stages)}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{formatActivityDate(log.created_at)}</p>
            </div>
          </div>
        </div>
      )
    })}
  </div>
)

interface DealTimelineProps {
  dealId: string | undefined
  leadId: string
  stages?: { id: string; name: string }[]
}

/**
 * Aba Historico do negocio, em dois blocos:
 *   1. o historico deste negocio (resource_type='deal'), formato definitivo;
 *   2. sob o divisor "Contato", o historico do contato anterior ao primeiro log
 *      deste negocio.
 *
 * Blocos separados, e nao uma lista unica intercalada: a ordem cronologica ja os
 * separa (tudo do bloco 2 e mais antigo que tudo do bloco 1) e misturar afirmaria
 * que evento do contato pertence a este negocio, o que e falso justamente para
 * contato com varios negocios.
 *
 * O divisor e o unico sinal de origem: as linhas dos dois blocos sao visualmente
 * identicas. Se o bloco 2 crescer a ponto de o divisor sair da area visivel do
 * scroll, vale torna-lo sticky.
 */
const DealTimeline = ({ dealId, leadId, stages }: DealTimelineProps) => {
  const { data: dealLogs, isLoading: isLoadingDeal } = useDealActivityLogs(dealId)
  const { data: leadLogs, isLoading: isLoadingLead } = useLeadActivityLogs(leadId)

  const logsDoNegocio = dealLogs ?? []

  // Fronteira do bloco 2: o log MAIS ANTIGO deste negocio, e nao uma data fixa.
  //
  // Enquanto log_lead_activity continuar gravando o eco do espelho (a Onda 1 e
  // aditiva de proposito), um contato com 1 negocio produz DOIS logs para a mesma
  // acao, um 'deal' e um 'lead'. Sem corte, o mesmo movimento apareceria duas
  // vezes na aba e o vendedor leria como "alguem moveu duas vezes".
  //
  // O eco so passa a existir no instante em que trg_log_deal_activity comeca a
  // gravar, entao todo log de contato anterior ao primeiro log deste negocio e
  // necessariamente anterior ao trigger e nao pode ser eco. Derivar do dado, em
  // vez de uma constante, ajusta sozinho negocio a negocio e em cada ambiente,
  // que aplicam a migration em datas diferentes.
  //
  // Tem que ser o mais antigo. Usar o mais recente passa no primeiro movimento e
  // vaza o anterior para o bloco de baixo a partir do segundo.
  //
  // Os logs vem ordenados por created_at DESC da service, entao o mais antigo e o
  // ultimo. Comparacao por Date e nao por string, para nao depender do formato de
  // timestamp que o PostgREST devolve.
  const corte = logsDoNegocio.length
    ? new Date(logsDoNegocio[logsDoNegocio.length - 1].created_at)
    : null

  // Sem log do negocio, o bloco 2 mostra o historico do contato inteiro.
  const logsAnteriores = (leadLogs ?? []).filter(
    (log) => !corte || new Date(log.created_at) < corte
  )

  if (isLoadingDeal || isLoadingLead) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    )
  }

  if (logsDoNegocio.length === 0 && logsAnteriores.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada para este negócio.</p>
      </div>
    )
  }

  return (
    <div className="max-h-[40vh] overflow-y-auto space-y-4">
      {logsDoNegocio.length > 0 && <TimelineList logs={logsDoNegocio} stages={stages} />}

      {logsAnteriores.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Contato
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <TimelineList logs={logsAnteriores} stages={stages} />
        </div>
      )}
    </div>
  )
}

export { DealTimeline }
