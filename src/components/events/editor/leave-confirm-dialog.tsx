import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface LeaveConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const LeaveConfirmDialog = ({ open, onConfirm, onCancel }: LeaveConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
        <AlertDialogDescription>As alterações feitas desde o último Salvar serão perdidas.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Continuar editando</AlertDialogCancel>
        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
          Sair sem salvar
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
