import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DealCard } from '@/components/pipeline/deal-card'
import { Button } from '@/components/ui/button'
import type { PipelineStage, DealWithLead } from '@/types/database'

interface StageColumnProps {
  stage: PipelineStage
  deals: DealWithLead[]
  onAddLead: (stageId: string) => void
  onEditDeal?: (leadId: string, dealId: string) => void
  onTransferDeal?: (dealId: string) => void
  onMovePipeline?: (deal: DealWithLead) => void
  onCreateDeal?: (leadId: string, leadName: string) => void
  fireOnly?: boolean
}

const StageColumn = ({ stage, deals, onAddLead, onEditDeal, onTransferDeal, onMovePipeline, onCreateDeal, fireOnly }: StageColumnProps) => {
  const { setNodeRef, isOver, over, active } = useDroppable({ id: stage.id })

  const dealIds = deals.map((d) => d.id)

  // Cada card e droppable proprio (useSortable), e com closestCorners os cantos de
  // um card ficam mais perto que os da coluna inteira. Entao ao pairar sobre a lista
  // o over vira o id do card e isOver da coluna fica false: destacar so por isOver
  // acenderia o ring apenas em coluna vazia.
  const isOverColumn = !!active && (isOver || deals.some((d) => d.id === over?.id))

  return (
    // Droppable e a coluna INTEIRA (cabecalho + lista + botao). Sem overflow aqui:
    // a rolagem fica no container interno, senao a zona de drop seria recortada
    // ao viewport da lista e soltar num ponto rolado nao contaria.
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[300px] min-w-[280px] max-w-[320px] flex-shrink-0 flex-col h-full rounded-xl transition-shadow',
        isOverColumn && 'ring-2 ring-inset ring-primary/40'
      )}
    >
      <div
        className="mb-2 rounded-t-xl px-3 py-2.5"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${stage.color} 18%, transparent), color-mix(in srgb, ${stage.color} 4%, transparent))`,
          borderBottom: `1px solid color-mix(in srgb, ${stage.color} 15%, transparent)`,
        }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-sm font-semibold"
            style={{ color: `color-mix(in srgb, ${stage.color} 75%, hsl(var(--foreground)))` }}
          >
            {stage.name}
          </h3>
          <span
            className="flex items-center justify-center rounded-full text-[10px] font-semibold"
            style={{
              width: 22,
              height: 22,
              backgroundColor: stage.color,
              color: '#fff',
            }}
          >
            {deals.length}
          </span>
        </div>
      </div>

      <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
        <div
          className={cn(
            // O tint vai aqui, e nao no wrapper: .kanban-column tem bg-muted/30 e
            // cobriria um fundo pintado no elemento de tras.
            'kanban-column flex-1 space-y-2 rounded-xl p-2 overflow-y-auto scrollbar-minimal transition-colors',
            isOverColumn && 'bg-primary/5'
          )}
        >
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onEditDeal={onEditDeal} onTransfer={onTransferDeal} onMovePipeline={onMovePipeline} onCreateDeal={onCreateDeal} fireOnly={fireOnly} />
          ))}

          {deals.length === 0 && (
            <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border/50">
              <p className="text-xs text-muted-foreground">Arraste negocios aqui</p>
            </div>
          )}
        </div>
      </SortableContext>

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full text-muted-foreground hover:text-foreground"
        onClick={() => onAddLead(stage.id)}
      >
        <Plus className="mr-1 h-4 w-4" />
        Novo Lead
      </Button>
    </div>
  )
}

export { StageColumn }
