import { useNavigate } from 'react-router-dom'
import { AlertTriangle, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SalesPulseData, SalesPulseAlerta, SalesPulseAcao } from '@/hooks/use-sales-pulse'

const ALERT_META: Record<SalesPulseAlerta['tipo'], { icon: typeof AlertTriangle; className: string }> = {
  urgente: { icon: AlertTriangle, className: 'text-red-500' },
  oportunidade: { icon: TrendingUp, className: 'text-emerald-500' },
  atencao: { icon: AlertCircle, className: 'text-blue-500' },
}

const acaoHref = (acao: SalesPulseAcao): string => {
  if (acao.destino === 'inbox' && acao.lead_id) return `/inbox/${acao.lead_id}`
  return `/${acao.destino}`
}

/**
 * Conteudo IA do Copiloto (modo sales-pulse via gateway): situacao no topo,
 * alertas e acoes clicaveis. Renderizado apenas quando a empresa tem acesso de IA
 * e a edge respondeu com payload valido; caso contrario o card usa o fallback local.
 */
const CopilotAiContent = ({ data }: { data: SalesPulseData }) => {
  const navigate = useNavigate()

  return (
    <div className="space-y-3">
      {data.situacao && (
        <p className="text-xs text-muted-foreground leading-relaxed">{data.situacao}</p>
      )}

      {data.alertas?.length > 0 && (
        <div className="space-y-2">
          {data.alertas.map((alerta, i) => {
            const meta = ALERT_META[alerta.tipo] ?? ALERT_META.atencao
            const Icon = meta.icon
            const clickable = !!alerta.lead_id
            return (
              <button
                key={`alerta-${i}`}
                type="button"
                disabled={!clickable}
                onClick={() => alerta.lead_id && navigate(`/inbox/${alerta.lead_id}`)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-smooth',
                  'bg-purple-500/5 border border-purple-500/10',
                  clickable ? 'hover:bg-purple-500/10' : 'cursor-default',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', meta.className)} />
                <span className="flex-1 min-w-0 text-xs font-medium">{alerta.texto}</span>
              </button>
            )
          })}
        </div>
      )}

      {data.acoes?.length > 0 && (
        <div className="space-y-2">
          {data.acoes.map((acao, i) => (
            <button
              key={`acao-${i}`}
              type="button"
              onClick={() => navigate(acaoHref(acao))}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-smooth',
                'bg-purple-500/5 border border-purple-500/10 hover:bg-purple-500/10',
              )}
            >
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-purple-600" />
              <span className="flex-1 min-w-0 text-xs font-medium">{acao.texto}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { CopilotAiContent }
