import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Lock, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldInputPreview } from '@/components/events/editor/form/field-input-preview'
import { SortableFieldItem } from '@/components/events/editor/form/sortable-field-item'
import { isRequiredLocked, type FieldDraft } from '@/lib/events/field-catalog'
import { marketingText, PRIVACY_TEXT } from '@/lib/events/consent-texts'

interface FormPreviewProps {
  fixed: FieldDraft[]
  others: FieldDraft[]
  errorIds: Set<string>
  readOnly: boolean
  organizer: string
  privacyUrl: string
  onReorder: (next: FieldDraft[]) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export const FormPreview = (p: FormPreviewProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = p.others.findIndex((f) => f.id === active.id)
    const to = p.others.findIndex((f) => f.id === over.id)
    if (from >= 0 && to >= 0) p.onReorder(arrayMove(p.others, from, to))
  }

  return (
    <div className="space-y-4 rounded-lg bg-muted/50 p-4 md:p-6">
      <section className="space-y-4 rounded-md border bg-card p-4">
        <h3 className="text-sm font-semibold">Dados do participante</h3>
        {p.fixed.map((f) => (
          <div key={f.id} className="flex gap-2">
            <div className="min-w-0 flex-1"><FieldInputPreview field={f} /></div>
            {isRequiredLocked(f) ? (
              <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Campo fixo" />
            ) : (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Editar campo"
                onClick={() => p.onEdit(f.id)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </section>

      {p.others.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={p.others.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {p.others.map((f) => (
                <SortableFieldItem key={f.id} field={f} hasError={p.errorIds.has(f.id)} readOnly={p.readOnly}
                  onEdit={() => p.onEdit(f.id)} onDelete={() => p.onDelete(f.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Adicione perguntas pelos chips ao lado.
        </p>
      )}

      <section className="space-y-2 rounded-md border bg-card p-4 text-sm" aria-label="Aceites">
        <p className="flex items-start gap-2">
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-input" />
          <span>
            {PRIVACY_TEXT.replace('Política de Privacidade', '')}
            {p.privacyUrl ? (
              <a href={p.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Política de Privacidade</a>
            ) : (
              <span className="text-primary underline">Política de Privacidade</span>
            )}
            <span className="text-destructive"> *</span>
          </span>
        </p>
        <p className="flex items-start gap-2">
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-input" />
          <span>{marketingText(p.organizer)}</span>
        </p>
        <p className="text-xs text-muted-foreground">Fixos em todo evento: o primeiro é obrigatório, o segundo nasce desmarcado.</p>
      </section>
    </div>
  )
}
