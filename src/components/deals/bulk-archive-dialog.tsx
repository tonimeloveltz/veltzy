import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBulkArchiveDeals } from '@/hooks/use-bulk-leads'

interface BulkArchiveDialogProps {
  open: boolean
  onClose: () => void
  leadIds: string[]
  onSuccess: () => void
  mode?: 'leads' | 'deals'
}

export const BulkArchiveDialog = ({ open, onClose, leadIds, onSuccess, mode = 'leads' }: BulkArchiveDialogProps) => {
  const done = () => {
    onSuccess()
    onClose()
  }

  // Os ids recebidos sao sempre ids de deal: arquivar escreve em `deals`.
  const bulkArchive = useBulkArchiveDeals(done)

  const handleArchive = async () => {
    await bulkArchive.mutateAsync({ dealIds: leadIds })
  }

  // `mode` escolhe apenas o rotulo, nao o destino da escrita.
  const label = mode === 'deals' ? 'negócio' : 'lead'

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Arquivar {leadIds.length} {label}{leadIds.length > 1 ? 's' : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Os {label}s serao ocultados da view padrao. Voce pode recupera-los usando o filtro "Mostrar arquivados".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={bulkArchive.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleArchive} disabled={bulkArchive.isPending}>
            {bulkArchive.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Arquivando...
              </>
            ) : (
              'Arquivar'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
