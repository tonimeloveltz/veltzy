import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Pipeline } from '@/types/database'

interface ReactivatePipelineDialogProps {
  pipeline: Pipeline | null
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}

const ReactivatePipelineDialog = ({ pipeline, onClose, onConfirm, isPending }: ReactivatePipelineDialogProps) => (
  <AlertDialog open={!!pipeline} onOpenChange={(v) => !v && onClose()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Pipeline desativado</AlertDialogTitle>
        <AlertDialogDescription>
          Já existe um pipeline desativado chamado "{pipeline?.name}". Quer reativá-lo? As etapas e
          configurações dele voltam como estavam.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Reativando...
            </>
          ) : (
            'Reativar'
          )}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

export { ReactivatePipelineDialog }
