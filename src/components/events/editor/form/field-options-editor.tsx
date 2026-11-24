import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLeadTags } from '@/hooks/use-lead-tags'
import { MAX_OPTIONS, MIN_OPTIONS, newOption } from '@/lib/events/field-catalog'
import type { EventFieldOption } from '@/types/events'
import type { DealPriority } from '@/types/database'

const PRIORITIES: Array<{ value: DealPriority | 'none'; label: string }> = [
  { value: 'none', label: 'Sem prioridade' },
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]
const TAGS_LIST_ID = 'event-option-tags'

interface OptionRowProps {
  option: EventFieldOption
  index: number
  canRemove: boolean
  onChange: (patch: Partial<EventFieldOption>) => void
  onRemove: () => void
}

const OptionRow = ({ option, index, canRemove, onChange, onRemove }: OptionRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: option.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className="space-y-2 rounded-md border bg-background p-2">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Arrastar opção" {...attributes} {...listeners}
          className="cursor-grab touch-none text-muted-foreground"><GripVertical className="h-4 w-4" /></button>
        <Input value={option.label} placeholder={`Opção ${index + 1}`} maxLength={120} className="h-9"
          onChange={(e) => onChange({ label: e.target.value })} aria-label={`Opção ${index + 1}`} />
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Remover opção"
          disabled={!canRemove} onClick={onRemove}><X className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-5">
        <Input value={option.tag ?? ''} list={TAGS_LIST_ID} placeholder="Tag (opcional)" className="h-8 text-xs"
          maxLength={60} onChange={(e) => onChange({ tag: e.target.value || null })} aria-label="Tag aplicada" />
        <Select value={option.priority ?? 'none'}
          onValueChange={(v) => onChange({ priority: v === 'none' ? null : (v as DealPriority) })}>
          <SelectTrigger className="h-8 text-xs" aria-label="Prioridade do negócio"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

interface FieldOptionsEditorProps {
  options: EventFieldOption[]
  error?: string
  onChange: (next: EventFieldOption[]) => void
}

/** Opcoes reordenaveis com a regra de qualificacao (tag e prioridade) de cada uma. */
export const FieldOptionsEditor = ({ options, error, onChange }: FieldOptionsEditorProps) => {
  const { data: tags } = useLeadTags()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = options.findIndex((o) => o.id === active.id)
    const to = options.findIndex((o) => o.id === over.id)
    if (from >= 0 && to >= 0) onChange(arrayMove(options, from, to))
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Tag e prioridade são a regra de qualificação: quem escolhe a opção recebe a tag no contato, e o negócio fica com a maior prioridade escolhida.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          {options.map((o, i) => (
            <OptionRow key={o.id} option={o} index={i} canRemove={options.length > MIN_OPTIONS}
              onChange={(patch) => onChange(options.map((x) => (x.id === o.id ? { ...x, ...patch } : x)))}
              onRemove={() => onChange(options.filter((x) => x.id !== o.id))} />
          ))}
        </SortableContext>
      </DndContext>
      <datalist id={TAGS_LIST_ID}>
        {(tags ?? []).map((t) => <option key={t.id} value={t.name} />)}
      </datalist>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="button" variant="outline" size="sm" disabled={options.length >= MAX_OPTIONS}
        onClick={() => onChange([...options, newOption(`Opção ${options.length + 1}`)])}>
        <Plus className="h-4 w-4" /> Adicionar opção
      </Button>
    </div>
  )
}
