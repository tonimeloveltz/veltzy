import { useState, useMemo, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, AlertTriangle, Loader2, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StageColumn } from '@/components/pipeline/stage-column'
import { DealCard } from '@/components/pipeline/deal-card'
import { NewDealModal } from '@/components/deals/new-deal-modal'
import { EditLeadModal } from '@/components/pipeline/edit-lead-modal'
import { PipelineHeader } from '@/components/pipeline/pipeline-header'
import { PipelineSelector } from '@/components/pipeline/pipeline-selector'
import { StageManagerModal } from '@/components/pipeline/stage-manager-modal'
import { TransferLeadModal } from '@/components/pipeline/transfer-lead-modal'
import { MovePipelineModal } from '@/components/pipeline/move-pipeline-modal'
import { DealValueDialog } from '@/components/pipeline/deal-value-dialog'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useDealsForKanban, useMoveDealStage, useUpdateDealValueAndMove } from '@/hooks/use-deals'
import { useLeadDetail } from '@/hooks/use-lead-detail'
import { usePipelineStore } from '@/stores/pipeline.store'
import { triggerCelebration } from '@/lib/celebration'
import { isClosedInCurrentMonth } from '@/lib/current-month'
import type { DealWithLead } from '@/types/database'

function isProposalStage(slug: string) {
  return slug.includes('proposta') || slug.includes('proposal')
}

const PipelineBoard = () => {
  const queryClient = useQueryClient()
  const { data: pipelines, isLoading: pipelinesLoading } = useAccessiblePipelines()
  const { activePipelineId, setActivePipelineId } = usePipelineStore()

  useEffect(() => {
    if (!pipelines || pipelines.length === 0) return
    const activeExists = activePipelineId && pipelines.some((p) => p.id === activePipelineId)
    if (!activeExists) {
      const defaultPipeline = pipelines.find((p) => p.is_default) ?? pipelines[0]
      setActivePipelineId(defaultPipeline.id)
    }
  }, [pipelines, activePipelineId, setActivePipelineId])

  const { data: stages, isLoading: stagesLoading, isFetching: stagesFetching, isError: stagesError, refetch: refetchStages } = usePipelineStages()
  const { data: deals, isLoading: dealsLoading, isFetching: dealsFetching, isError: dealsError, refetch: refetchDeals } = useDealsForKanban(activePipelineId)
  const isRefetching = (stagesFetching && !stagesLoading) || (dealsFetching && !dealsLoading)
  const moveDealStage = useMoveDealStage()
  const updateDealValueAndMove = useUpdateDealValueAndMove()

  const { selectedLeadId, setSelectedLeadId, filters } = usePipelineStore()

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createModalStageId, setCreateModalStageId] = useState<string>()
  const [stageManagerOpen, setStageManagerOpen] = useState(false)
  const [transferDealId, setTransferDealId] = useState<string | null>(null)
  const [movePipelineDeal, setMovePipelineDeal] = useState<DealWithLead | null>(null)
  const [fireOnly, setFireOnly] = useState(false)
  const [dealValuePending, setDealValuePending] = useState<{ dealId: string; stageId: string; dealName: string } | null>(null)
  const [activeDealId, setActiveDealId] = useState<string | null>(null)
  const [editDealId, setEditDealId] = useState<string | null>(null)
  const [createDealForLead, setCreateDealForLead] = useState<{ leadId: string; leadName: string } | null>(null)

  // For EditLeadModal: fetch lead data when editing
  const { data: selectedLeadData } = useLeadDetail(selectedLeadId)

  // For the transfer modal: find the lead_id from the deal
  const transferLeadId = useMemo(() => {
    if (!transferDealId || !deals) return null
    const deal = deals.find((d) => d.id === transferDealId)
    return deal?.lead_id ?? null
  }, [transferDealId, deals])

  const sensors = useSensors(
    // Sensores separados por tipo de entrada. O PointerSensor unico nao
    // funcionava em touch: sem `touch-action: none` o navegador reivindica
    // o gesto e dispara pointercancel, abortando o arraste. E `touch-action:
    // none` esta fora de questao porque mataria a rolagem do track e das
    // colunas. O `delay` resolve sem CSS: mover o dedo rola, segurar arrasta.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const filteredDeals = useMemo(() => {
    if (!deals) return []
    // Fechados (won/lost) so aparecem no board se closed_at for do mes corrente;
    // os de meses anteriores recolhem para o historico (seguem em /deals e no
    // contato). Abertos/pending nao sao afetados.
    let result = deals.filter((d) =>
      d.status === 'won' || d.status === 'lost' ? isClosedInCurrentMonth(d.closed_at) : true
    )
    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (d) =>
          d.leads?.name?.toLowerCase().includes(q) ||
          d.leads?.phone?.includes(q) ||
          d.leads?.email?.toLowerCase().includes(q) ||
          d.leads?.company_name?.toLowerCase().includes(q) ||
          d.name?.toLowerCase().includes(q) ||
          d.leads?.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (filters.temperature) {
      result = result.filter((d) => d.leads?.temperature === filters.temperature)
    }
    if (filters.sourceId) {
      result = result.filter((d) => d.leads?.source_id === filters.sourceId)
    }
    return result
  }, [deals, filters.search, filters.temperature, filters.sourceId])

  // Separate pending_assignment deals for special column
  const pendingDeals = useMemo(
    () => filteredDeals.filter((d) => d.status === 'pending_assignment'),
    [filteredDeals]
  )
  const activeDeals = useMemo(
    () => filteredDeals.filter((d) => d.status !== 'pending_assignment'),
    [filteredDeals]
  )

  const dealsByStage = useMemo(() => {
    const map: Record<string, DealWithLead[]> = {}
    stages?.forEach((s) => { map[s.id] = [] })
    activeDeals.forEach((d) => {
      if (d.stage_id && map[d.stage_id]) {
        map[d.stage_id].push(d)
      }
    })
    return map
  }, [activeDeals, stages])

  const dealCounts = useMemo(() => {
    const map: Record<string, number> = {}
    deals?.forEach((d) => {
      if (d.stage_id) map[d.stage_id] = (map[d.stage_id] ?? 0) + 1
    })
    return map
  }, [deals])

  const orphanedCount = useMemo(() => {
    if (!activeDeals || !stages) return 0
    const stageIds = new Set(stages.map((s) => s.id))
    return activeDeals.filter((d) => !d.stage_id || !stageIds.has(d.stage_id)).length
  }, [activeDeals, stages])

  const activeDeal = useMemo(
    () => deals?.find((d) => d.id === activeDealId) ?? null,
    [deals, activeDealId]
  )

  // Convert deals to lead-like array for PipelineHeader (search/filter counts)
  const filteredLeadsForHeader = useMemo(() => {
    return filteredDeals.map((d) => ({
      ...d.leads,
      id: d.id,
      deal_value: d.value,
    }))
  }, [filteredDeals])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDealId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDealId(null)
    try {
      const { active, over } = event
      if (!over) return

      const dealId = active.id as string
      const overId = over.id as string

      const targetStage = stages?.find((s) => s.id === overId)
      const deal = deals?.find((d) => d.id === dealId)

      if (!deal) return

      const stageId = targetStage ? targetStage.id : deals?.find((d) => d.id === overId)?.stage_id
      if (!stageId || stageId === deal.stage_id) return

      const destStage = stages?.find((s) => s.id === stageId)

      // Interceptar: proposta sem valor
      if (destStage && isProposalStage(destStage.slug) && (!deal.value || deal.value <= 0)) {
        setDealValuePending({ dealId, stageId, dealName: deal.leads?.name || deal.leads?.phone || deal.name })
        return
      }

      const status = destStage?.is_final
        ? destStage.is_positive ? 'won' as const : 'lost' as const
        : undefined

      moveDealStage.mutate({ dealId, stageId, status })

      if (status === 'won') {
        triggerCelebration()
        toast.success('Negocio fechado! 🎉')
      } else if (status === 'lost') {
        toast.info('Negocio marcado como perdido')
      }
    } catch {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.error('Erro ao mover negocio. Tente novamente.')
    }
  }, [deals, stages, moveDealStage, queryClient])

  const handleAddLead = useCallback((stageId?: string) => {
    setCreateModalStageId(stageId)
    setCreateModalOpen(true)
  }, [])

  const handleEditDeal = useCallback((leadId: string, dealId: string) => {
    setSelectedLeadId(leadId)
    setEditDealId(dealId)
  }, [setSelectedLeadId])

  const handleCreateDeal = useCallback((leadId: string, leadName: string) => {
    setCreateDealForLead({ leadId, leadName })
  }, [])

  if (pipelinesLoading || (stagesLoading && !!activePipelineId) || (dealsLoading && !!activePipelineId)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (stagesError || dealsError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Erro ao carregar o pipeline</p>
        <Button variant="outline" size="sm" onClick={() => { refetchStages(); refetchDeals() }}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full animate-fade-in">
      <div className="shrink-0 p-4 pb-3 sm:p-6 sm:pb-4 space-y-3">
        {pipelines && activePipelineId && (
          <PipelineSelector
            pipelines={pipelines}
            activePipelineId={activePipelineId}
            onSelect={setActivePipelineId}
          />
        )}
        <PipelineHeader
          onAddLead={() => handleAddLead()}
          onManageStages={() => setStageManagerOpen(true)}
          fireOnly={fireOnly}
          onToggleFireOnly={() => setFireOnly((v) => !v)}
          leads={filteredLeadsForHeader as never}
          pipelineName={pipelines && pipelines.length > 1 ? pipelines.find((p) => p.id === activePipelineId)?.name : undefined}
        />
      </div>

      {orphanedCount > 0 && (
        <div className="mx-4 sm:mx-6 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{orphanedCount} negocio{orphanedCount > 1 ? 's' : ''} sem etapa definida (invisive{orphanedCount > 1 ? 'is' : 'l'} no board). Mova-os para uma etapa pelo painel admin.</span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={cn(
          'flex-1 min-h-0 flex gap-4 overflow-x-auto overflow-y-hidden px-4 sm:px-6 pb-4 transition-opacity duration-200',
          isRefetching && 'opacity-50 pointer-events-none'
        )}>
          {/* Coluna especial: Sem dono (pending_assignment) */}
          {pendingDeals.length > 0 && (
            <div className="flex w-[300px] min-w-[280px] max-w-[320px] flex-shrink-0 flex-col h-full min-h-0">
              <div
                className="mb-2 rounded-t-xl px-3 py-2.5"
                style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(245, 158, 11, 0.04))',
                  borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    Sem dono
                  </h3>
                  <span
                    className="flex items-center justify-center rounded-full text-[10px] font-semibold bg-amber-500 text-white"
                    style={{ width: 22, height: 22 }}
                  >
                    {pendingDeals.length}
                  </span>
                </div>
              </div>
              <div className="kanban-column flex-1 min-h-0 space-y-2 rounded-xl p-2 overflow-y-auto scrollbar-minimal">
                {pendingDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onEditDeal={handleEditDeal} onTransfer={setTransferDealId} onMovePipeline={setMovePipelineDeal} onCreateDeal={handleCreateDeal} fireOnly={fireOnly} />
                ))}
              </div>
            </div>
          )}

          {stages?.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] ?? []}
              onAddLead={handleAddLead}
              onEditDeal={handleEditDeal}
              onTransferDeal={setTransferDealId}
              onMovePipeline={setMovePipelineDeal}
              onCreateDeal={handleCreateDeal}
              fireOnly={fireOnly}
            />
          ))}
        </div>

        {!isRefetching && stages && stages.length > 0 && filteredDeals.length === 0 && !filters.search && !filters.sourceId && !filters.temperature && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none" style={{ top: '40%' }}>
            <Inbox className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum negocio neste pipeline</p>
            <Button size="sm" className="pointer-events-auto" onClick={() => handleAddLead()}>
              Criar primeiro negocio
            </Button>
          </div>
        )}

        <DragOverlay dropAnimation={null}>
          {activeDeal ? (
            <div className="w-[280px] rotate-2 scale-105 opacity-90 shadow-2xl">
              <DealCard deal={activeDeal} fireOnly={fireOnly} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <NewDealModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        defaultPipelineId={activePipelineId ?? undefined}
        defaultStageId={createModalStageId}
      />

      <EditLeadModal
        lead={selectedLeadData ?? null}
        open={!!selectedLeadId}
        onClose={() => { setSelectedLeadId(null); setEditDealId(null) }}
        dealId={editDealId}
      />

      <StageManagerModal
        open={stageManagerOpen}
        onClose={() => setStageManagerOpen(false)}
        leadCounts={dealCounts}
      />

      <TransferLeadModal
        leadId={transferLeadId}
        dealId={transferDealId}
        open={!!transferDealId}
        onClose={() => setTransferDealId(null)}
      />

      <MovePipelineModal
        dealId={movePipelineDeal?.id ?? null}
        dealName={movePipelineDeal?.leads?.name || movePipelineDeal?.leads?.phone || movePipelineDeal?.name || ''}
        currentPipelineId={activePipelineId ?? ''}
        open={!!movePipelineDeal}
        onClose={() => setMovePipelineDeal(null)}
      />

      {createDealForLead && (
        <NewDealModal
          open={!!createDealForLead}
          onClose={() => setCreateDealForLead(null)}
          lockedLeadId={createDealForLead.leadId}
          lockedLeadName={createDealForLead.leadName}
          defaultPipelineId={activePipelineId ?? undefined}
        />
      )}

      <DealValueDialog
        open={!!dealValuePending}
        onOpenChange={(open) => { if (!open) setDealValuePending(null) }}
        leadName={dealValuePending?.dealName ?? ''}
        onConfirm={(value) => {
          if (!dealValuePending) return
          updateDealValueAndMove.mutate({
            dealId: dealValuePending.dealId,
            stageId: dealValuePending.stageId,
            value,
          })
          const destStage = stages?.find((s) => s.id === dealValuePending.stageId)
          if (destStage?.is_final && destStage?.is_positive) {
            triggerCelebration()
            toast.success('Negocio fechado! 🎉')
          }
          setDealValuePending(null)
        }}
      />
    </div>
  )
}

export { PipelineBoard }
