import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DateNoticeConfirmDialogProps {
  /** inscritos ativos que vao receber o aviso; null fecha o dialogo */
  count: number | null
  onConfirm: () => void
  onCancel: () => void
}

export const DateNoticeConfirmDialog = ({ count, onConfirm, onCancel }: DateNoticeConfirmDialogProps) => (
  <AlertDialog open={count !== null} onOpenChange={(o) => !o && onCancel()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Avisar os inscritos da nova data?</AlertDialogTitle>
        <AlertDialogDescription>
          {count === 1 ? '1 inscrito vai receber' : `${count ?? 0} inscritos vão receber`} no WhatsApp o aviso
          da nova data, 10 minutos depois de salvar. Se voltar para o dia anterior antes disso, o aviso não sai.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Voltar</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Salvar e avisar</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
