import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBulkArchive, useBulkArchiveDeals } from '@/hooks/use-bulk-leads'

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

  // Em 'deals' os ids recebidos sao ids de deal: mandar para o service de leads
  // atualizaria zero linhas e ainda assim responderia 200.
  const bulkArchiveLeads = useBulkArchive(done)
  const bulkArchiveDeals = useBulkArchiveDeals(done)
  const bulkArchive = mode === 'deals' ? bulkArchiveDeals : bulkArchiveLeads

  const handleArchive = async () => {
    if (mode === 'deals') {
      await bulkArchiveDeals.mutateAsync({ dealIds: leadIds })
    } else {
      await bulkArchiveLeads.mutateAsync({ leadIds })
    }
  }

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
