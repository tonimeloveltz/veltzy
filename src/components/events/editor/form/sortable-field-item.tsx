import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FieldInputPreview } from '@/components/events/editor/form/field-input-preview'
import type { FieldDraft } from '@/lib/events/field-catalog'

interface SortableFieldItemProps {
  field: FieldDraft
  hasError: boolean
  readOnly: boolean
  onEdit: () => void
  onDelete: () => void
}

export const SortableFieldItem = ({ field, hasError, readOnly, onEdit, onDelete }: SortableFieldItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id, disabled: readOnly,
  })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex gap-2 rounded-md border bg-background p-3',
        hasError && 'border-destructive', isDragging && 'relative z-10 shadow-lg')}>
      {!readOnly && (
        <button type="button" aria-label="Arrastar para reordenar" {...attributes} {...listeners}
          className="cursor-grab touch-none self-start pt-0.5 text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <FieldInputPreview field={field} />
        {hasError && <p className="mt-1 text-xs text-destructive">Este campo tem pendências. Abra para corrigir.</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar campo" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {!readOnly && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Excluir campo"
            onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
