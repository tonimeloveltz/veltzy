import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteCadence } from '@/hooks/use-cadences'
import type { Cadence } from '@/types/database'

interface DeleteCadenceDialogProps {
  cadence: Cadence | null
  onClose: () => void
}

export const DeleteCadenceDialog = ({ cadence, onClose }: DeleteCadenceDialogProps) => {
  const deleteCadence = useDeleteCadence()

  const handleDelete = async () => {
    if (!cadence) return
    await deleteCadence.mutateAsync(cadence.id)
    onClose()
  }

  return (
    <AlertDialog open={!!cadence} onOpenChange={(v) => !v && !deleteCadence.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Excluir "{cadence?.name}"</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Os passos e o acompanhamento dos contatos serão apagados,
            e quem está no meio da sequência para de receber as próximas mensagens.
            Para só pausar, desative a automação.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteCadence.isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteCadence.isPending}>
            {deleteCadence.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Excluindo...
              </>
            ) : (
              'Excluir automação'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
