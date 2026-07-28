import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Plus, ChevronDown, ChevronUp, ExternalLink, Trophy, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDealsByLead, useCloseDeal } from '@/hooks/use-deals'
import { NewDealModal } from '@/components/deals/new-deal-modal'
import { triggerCelebration } from '@/lib/celebration'
import { dealStatusConfig } from '@/lib/lead-config'
import type { DealWithLead } from '@/types/database'

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface LeadDealsPanelProps {
  leadId: string
  leadName?: string | null
}

const LeadDealsPanel = ({ leadId, leadName }: LeadDealsPanelProps) => {
  const navigate = useNavigate()
  const { data: deals } = useDealsByLead(leadId)
  const closeDeal = useCloseDeal()
  const [expanded, setExpanded] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmLost, setConfirmLost] = useState<DealWithLead | null>(null)

  const activeDeals = deals?.filter((d) => d.status === 'open' || d.status === 'pending_assignment') ?? []
  const otherDeals = deals?.filter((d) => d.status !== 'open' && d.status !== 'pending_assignment') ?? []
  const allDeals = [...activeDeals, ...otherDeals]

  const handleWon = (deal: DealWithLead) => {
    if (!deal.pipeline_id) return
    closeDeal.mutate(
      { dealId: deal.id, pipelineId: deal.pipeline_id, outcome: 'won' },
      { onSuccess: () => triggerCelebration() },
    )
  }

  const handleLost = (deal: DealWithLead) => {
    if (!deal.pipeline_id) return
    closeDeal.mutate({ dealId: deal.id, pipelineId: deal.pipeline_id, outcome: 'lost' })
  }

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
              const status = dealStatusConfig[deal.status]
              const isActive = deal.status === 'open' || deal.status === 'pending_assignment'
              return (
                <div
                  key={deal.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent hover:text-accent-foreground transition-smooth group"
                >
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="flex flex-1 items-center gap-2 text-left min-w-0"
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', status.dotColor)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{deal.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {deal.pipeline_stages?.name ?? 'Sem etapa'}
                        {deal.value ? ` · ${fmt(deal.value)}` : ''}
                      </p>
                    </div>
                  </button>

                  {isActive ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleWon(deal) }}
                        disabled={closeDeal.isPending}
                        title="Marcar ganho"
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-500/15 transition-colors"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmLost(deal) }}
                        disabled={closeDeal.isPending}
                        title="Marcar perdido"
                        className="rounded p-1 text-red-500 hover:bg-red-500/15 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <ExternalLink
                      className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                      onClick={() => navigate('/pipeline')}
                    />
                  )}
                </div>
              )
            })}

            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-primary h-7 mt-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Novo negocio
            </Button>
          </div>
        )}
      </div>

      <NewDealModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        lockedLeadId={leadId}
        lockedLeadName={leadName}
      />

      <AlertDialog open={!!confirmLost} onOpenChange={(open) => !open && setConfirmLost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como perdido?</AlertDialogTitle>
            <AlertDialogDescription>
              O negocio "{confirmLost?.name}" sera marcado como perdido. Essa acao pode ser revertida no kanban.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmLost) handleLost(confirmLost)
                setConfirmLost(null)
              }}
            >
              Marcar perdido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export { LeadDealsPanel }
