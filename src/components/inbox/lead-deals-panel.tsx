import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Plus, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useDealsByLead } from '@/hooks/use-deals'
import { CreateDealModal } from '@/components/deals/create-deal-modal'
import type { DealStatus } from '@/types/database'

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const statusLabel: Record<DealStatus, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'bg-yellow-500' },
  won: { label: 'Fechado', color: 'bg-emerald-500' },
  lost: { label: 'Perdido', color: 'bg-red-500' },
  archived: { label: 'Arquivado', color: 'bg-muted-foreground' },
  pending_assignment: { label: 'Sem dono', color: 'bg-amber-500' },
}

interface LeadDealsPanelProps {
  leadId: string
  leadName?: string | null
}

const LeadDealsPanel = ({ leadId, leadName }: LeadDealsPanelProps) => {
  const navigate = useNavigate()
  const { data: deals } = useDealsByLead(leadId)
  const [expanded, setExpanded] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const activeDeals = deals?.filter((d) => d.status === 'open' || d.status === 'pending_assignment') ?? []
  const otherDeals = deals?.filter((d) => d.status !== 'open' && d.status !== 'pending_assignment') ?? []
  const allDeals = [...activeDeals, ...otherDeals]

  if (!deals) return null

  return (
    <>
      <div className="border-b px-4 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-smooth"
        >
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Negocios ({allDeals.length})
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {allDeals.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 py-1">Nenhum negocio</p>
            )}
            {allDeals.map((deal) => {
              const status = statusLabel[deal.status]
              return (
                <button
                  key={deal.id}
                  onClick={() => navigate('/pipeline')}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent transition-smooth group"
                >
                  <span className={cn('h-2 w-2 rounded-full shrink-0', status.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{deal.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {deal.pipeline_stages?.name ?? 'Sem etapa'}
                      {deal.value ? ` · ${fmt(deal.value)}` : ''}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )
            })}

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground h-7 mt-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Novo negocio
            </Button>
          </div>
        )}
      </div>

      <CreateDealModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        leadId={leadId}
        leadName={leadName ?? undefined}
      />
    </>
  )
}

export { LeadDealsPanel }
