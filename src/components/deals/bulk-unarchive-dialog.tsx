import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBulkUnarchiveDeals } from '@/hooks/use-bulk-leads'

interface BulkUnarchiveDialogProps {
  open: boolean
  onClose: () => void
  dealIds: string[]
  onSuccess: () => void
  mode?: 'leads' | 'deals'
}

export const BulkUnarchiveDialog = ({ open, onClose, dealIds, onSuccess, mode = 'leads' }: BulkUnarchiveDialogProps) => {
  const done = () => {
    onSuccess()
    onClose()
  }

  const bulkUnarchive = useBulkUnarchiveDeals(done)

  const handleUnarchive = async () => {
    await bulkUnarchive.mutateAsync({ dealIds })
  }

  // `mode` escolhe apenas o rotulo, nao o destino da escrita.
  const label = mode === 'deals' ? 'negócio' : 'lead'

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Desarquivar {dealIds.length} {label}{dealIds.length > 1 ? 's' : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Os {label}s voltam para a lista padrao e reaparecem no pipeline. Os que estavam em etapa de ganho ou de perda
            voltam com esse mesmo status, e nao como abertos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={bulkUnarchive.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleUnarchive} disabled={bulkUnarchive.isPending}>
            {bulkUnarchive.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Desarquivando...
              </>
            ) : (
              'Desarquivar'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
