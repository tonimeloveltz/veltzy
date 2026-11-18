import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EditorField } from '@/components/events/editor/editor-field'
import { EditorSection } from '@/components/events/editor/editor-section'
import { useTeamMembers } from '@/hooks/use-team'
import { useEventDealCounts } from '@/hooks/events/use-event-deal-counts'
import type { EditorValues } from '@/lib/events/editor-form'

interface QueueRowProps { id: string; name: string; next: boolean; deals?: number; onRemove: () => void }

const QueueRow = ({ id, name, next, deals, onRemove }: QueueRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
      <button type="button" aria-label="Arrastar" {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {next && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Próximo</span>}
      <span className="w-20 text-right text-xs text-muted-foreground">{deals ?? 0} negócios</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Tirar ${name}`} onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </li>
  )
}

interface AssignmentSectionProps {
  eventId: string
  rrCursor: number
  savedQueue: string[]
}

export const AssignmentSection = ({ eventId, rrCursor, savedQueue }: AssignmentSectionProps) => {
  const { control, register, setValue, formState: { errors } } = useFormContext<EditorValues>()
  const mode = useWatch({ control, name: 'assignment_mode' })
  const queue = useWatch({ control, name: 'assignees' })
  const { data: members = [] } = useTeamMembers()
  const counts = useEventDealCounts(eventId, 'assigned_to', mode === 'round_robin' ? queue : [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Pessoa removida'
  // "Proximo" vem do rr_cursor do banco: so vale para a fila salva.
  const queueSaved = queue.join() === savedQueue.join()
  const nextId = queueSaved && queue.length > 0 ? queue[rrCursor % queue.length] : null
  const setQueue = (next: string[]) => setValue('assignees', next, { shouldDirty: true })

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setQueue(arrayMove(queue, queue.indexOf(String(active.id)), queue.indexOf(String(over.id))))
  }

  return (
    <EditorSection title="Tag e responsável">
      <EditorField label="Tag aplicada em todo inscrito" htmlFor="event_tag_name" error={errors.event_tag_name?.message}
        hint="Vai para o contato. Vazio: nenhuma tag do evento.">
        <Input id="event_tag_name" maxLength={120} {...register('event_tag_name')} />
      </EditorField>
      <Controller control={control} name="assignment_mode" render={({ field }) => (
        <div role="radiogroup" aria-label="Responsável" className="grid grid-cols-2 gap-2">
          {(['fixed', 'round_robin'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={field.value === m} onClick={() => field.onChange(m)}
              className={cn('rounded-md border px-3 py-2 text-sm transition-smooth',
                field.value === m ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
              {m === 'fixed' ? 'Fixo' : 'Rodízio'}
            </button>
          ))}
        </div>
      )} />
      {mode === 'fixed' ? (
        <Controller control={control} name="fixed_assignee_id" render={({ field }) => (
          <Select value={field.value || undefined} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Responsável fixo"><SelectValue placeholder="Escolha quem atende" /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        )} />
      ) : (
        <div className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={queue} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {queue.map((id) => (
                  <QueueRow key={id} id={id} name={nameOf(id)} next={id === nextId} deals={counts.data?.[id]}
                    onRemove={() => setQueue(queue.filter((q) => q !== id))} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <Select value="" onValueChange={(id) => setQueue([...queue, id])}>
            <SelectTrigger aria-label="Adicionar ao rodízio"><SelectValue placeholder="Adicionar pessoa ao rodízio" /></SelectTrigger>
            <SelectContent>
              {members.filter((m) => !queue.includes(m.id)).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Quem não recebe distribuição de leads é pulado. Sem ninguém válido, o negócio fica com quem criou o evento.
      </p>
    </EditorSection>
  )
}
