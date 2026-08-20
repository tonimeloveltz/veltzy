import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, GripVertical, Loader2, StarOff } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ColorPicker } from '@/components/shared/color-picker'
import {
  usePipelines, useCreatePipeline, useUpdatePipeline,
  useDeletePipeline, useReorderPipelines, useSetDefaultPipeline,
} from '@/hooks/use-pipelines'
import { useAuthStore } from '@/stores/auth.store'
import { veltzy } from '@/lib/supabase'
import type { Pipeline } from '@/types/database'
import { cn } from '@/lib/utils'

const slugify = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

interface SortablePipelineRowProps {
  pipeline: Pipeline
  isSelected: boolean
  onSelect: (id: string) => void
  dealCount?: number
}

const SortablePipelineRow = ({ pipeline, isSelected, onSelect, dealCount }: SortablePipelineRowProps) => {
  const updatePipeline = useUpdatePipeline()
  const deletePipeline = useDeletePipeline()
  const setDefault = useSetDefaultPipeline()
  const [name, setName] = useState(pipeline.name)
  const [color, setColor] = useState(pipeline.color)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pipeline.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const handleBlur = () => {
    if (name !== pipeline.name || color !== pipeline.color) {
      updatePipeline.mutate({
        pipelineId: pipeline.id,
        data: { name, color, slug: slugify(name) },
      })
    }
  }

  const handleColorChange = (newColor: string) => {
    setColor(newColor)
    updatePipeline.mutate({ pipelineId: pipeline.id, data: { color: newColor } })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-smooth',
        isSelected ? 'border-primary bg-primary/5' : 'border-border/20 hover:bg-muted/50'
      )}
      onClick={() => onSelect(pipeline.id)}
    >
      <button
        type="button"
        className="cursor-grab touch-none"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/40" />
      </button>
      <div className="h-6 w-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <ColorPicker value={color} onChange={handleColorChange} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        className="h-7 flex-1 text-xs"
      />
      <span className="text-[10px] text-muted-foreground shrink-0">
        {dealCount ?? 0} negócios
      </span>
      {pipeline.is_default ? (
        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium shrink-0">
          Padrao
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="Definir como padrao"
          onClick={(e) => { e.stopPropagation(); setDefault.mutate(pipeline.id) }}
        >
          <StarOff className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
      {!pipeline.is_default && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive/60 hover:text-destructive shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Desativar "${pipeline.name}"?`)) deletePipeline.mutate(pipeline.id)
          }}
        >
          <span className="text-xs">x</span>
        </Button>
      )}
    </div>
  )
}

interface PipelineListManagerProps {
  selectedPipelineId: string | null
  onSelectPipeline: (id: string) => void
}

const PipelineListManager = ({ selectedPipelineId, onSelectPipeline }: PipelineListManagerProps) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const { data: pipelines, isLoading } = usePipelines()

  const pipelineIds = useMemo(() => (pipelines ?? []).map((p) => p.id), [pipelines])

  // Conta NEGOCIOS por pipeline, nao contatos: o pipeline mora em `deals`.
  //
  // Um `count: 'exact', head: true` por pipeline conta no servidor. A versao
  // anterior trazia todas as linhas e agrupava em JS, o que a deixava sujeita
  // ao teto do PostgREST (`max_rows`, 1000): acima disso a contagem sairia
  // errada e sem sintoma. Trocar a tabela sem trocar a tecnica levaria o
  // defeito junto.
  const { data: dealCounts } = useQuery({
    queryKey: ['pipeline-deal-counts', companyId, pipelineIds],
    queryFn: async () => {
      const entries = await Promise.all(
        pipelineIds.map(async (id) => {
          const { count, error } = await veltzy()
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId!)
            .eq('pipeline_id', id)
          if (error) throw error
          return [id, count ?? 0] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, number>
    },
    enabled: !!companyId && pipelineIds.length > 0,
  })
  const createPipeline = useCreatePipeline()
  const reorderPipelines = useReorderPipelines()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !pipelines || active.id === over.id) return

    const oldIndex = pipelines.findIndex((p) => p.id === active.id)
    const newIndex = pipelines.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...pipelines]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    reorderPipelines.mutate(reordered.map((p, i) => ({ id: p.id, position: i })))
  }, [pipelines, reorderPipelines])

  const handleAdd = async () => {
    if (!newName.trim()) return
    const result = await createPipeline.mutateAsync({ name: newName, slug: slugify(newName), color: newColor })
    setNewName('')
    onSelectPipeline(result.id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipelines</CardTitle>
        <CardDescription>Crie pipelines separados para diferentes processos comerciais (ex: Vendas B2B, Vendas B2C, Parcerias)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pipelines?.map((p) => p.id) ?? []} strategy={verticalListSortingStrategy}>
            {pipelines?.map((p) => (
              <SortablePipelineRow
                key={p.id}
                pipeline={p}
                isSelected={p.id === selectedPipelineId}
                onSelect={onSelectPipeline}
                dealCount={dealCounts?.[p.id]}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div className="flex items-center gap-2 pt-2 border-t border-border/20">
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Input
            placeholder="Novo pipeline..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-7 flex-1 text-xs"
          />
          <Button size="sm" className="h-7" onClick={handleAdd} disabled={createPipeline.isPending || !newName.trim()}>
            {createPipeline.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export { PipelineListManager }
