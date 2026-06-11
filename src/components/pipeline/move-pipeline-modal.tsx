import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { useMoveDealToPipeline } from '@/hooks/use-deals'
import { cn } from '@/lib/utils'

interface MovePipelineModalProps {
  dealId: string | null
  dealName: string
  currentPipelineId: string
  open: boolean
  onClose: () => void
}

const MovePipelineModal = ({ dealId, dealName, currentPipelineId, open, onClose }: MovePipelineModalProps) => {
  const { data: pipelines } = useAccessiblePipelines()
  const moveDealToPipeline = useMoveDealToPipeline()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const availablePipelines = pipelines?.filter((p) => p.id !== currentPipelineId) ?? []

  const handleConfirm = async () => {
    if (!dealId || !selectedId) return
    await moveDealToPipeline.mutateAsync({ dealId, targetPipelineId: selectedId })
    setSelectedId(null)
    onClose()
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedId(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover para pipeline</DialogTitle>
          <DialogDescription>
            Selecione o pipeline destino para {dealName || 'este negocio'}. O negocio ira para o primeiro estagio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {availablePipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-smooth',
                selectedId === p.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
              )}
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="font-medium">{p.name}</span>
              {p.is_default && (
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Padrao
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || moveDealToPipeline.isPending}
          >
            {moveDealToPipeline.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { MovePipelineModal }
