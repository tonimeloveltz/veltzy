import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useFieldAnswerCount } from '@/hooks/events/use-field-answer-count'
import type { FieldDraft } from '@/lib/events/field-catalog'

interface DeleteFieldDialogProps {
  eventId: string
  field: FieldDraft | null
  onConfirm: () => void
  onCancel: () => void
}

export const DeleteFieldDialog = ({ eventId, field, onConfirm, onCancel }: DeleteFieldDialogProps) => {
  const { data: answers = 0 } = useFieldAnswerCount(eventId, field?.id ?? null, !!field)
  return (
    <AlertDialog open={!!field} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir "{field?.label}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {answers > 0
              ? `${answers} ${answers === 1 ? 'inscrição já respondeu' : 'inscrições já responderam'} este campo. As respostas antigas ficam preservadas com o rótulo da época.`
              : 'O campo sai do formulário quando você salvar o evento.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
            Excluir campo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
