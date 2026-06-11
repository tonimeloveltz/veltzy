import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { useBulkMoveDealsPipeline } from '@/hooks/use-bulk-deals'

interface BulkMovePipelineModalProps {
  open: boolean
  onClose: () => void
  leadIds: string[]
  onSuccess: () => void
}

export const BulkMovePipelineModal = ({ open, onClose, leadIds, onSuccess }: BulkMovePipelineModalProps) => {
  const [targetPipelineId, setTargetPipelineId] = useState<string>('')
  const { data: pipelines } = useAccessiblePipelines()
  const bulkMove = useBulkMoveDealsPipeline(() => {
    onSuccess()
    handleClose()
  })

  const activePipelines = (pipelines ?? []).filter((p) => p.is_active)

  const handleClose = () => {
    setTargetPipelineId('')
    onClose()
  }

  const handleMove = async () => {
    if (!targetPipelineId) return
    await bulkMove.mutateAsync({ dealIds: leadIds, targetPipelineId })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover {leadIds.length} lead{leadIds.length > 1 ? 's' : ''} de pipeline</DialogTitle>
          <DialogDescription>
            Os leads serao movidos para a primeira etapa do pipeline selecionado.
          </DialogDescription>
        </DialogHeader>

        <Select value={targetPipelineId} onValueChange={setTargetPipelineId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um pipeline" />
          </SelectTrigger>
          <SelectContent>
            {activePipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: pipeline.color }} />
                  {pipeline.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={bulkMove.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleMove} disabled={!targetPipelineId || bulkMove.isPending}>
            {bulkMove.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Movendo...
              </>
            ) : (
              'Mover'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
