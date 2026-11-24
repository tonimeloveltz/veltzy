import { useEffect, useRef } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EditorSection } from '@/components/events/editor/editor-section'
import { StageSelect } from '@/components/events/editor/pipeline/stage-select'
import { usePipelines } from '@/hooks/use-pipelines'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useEventDealCounts } from '@/hooks/events/use-event-deal-counts'
import { autoMapStages, type StageMapping } from '@/lib/events/stage-mapping'
import type { EditorValues } from '@/lib/events/editor-form'

interface PipelineSectionProps {
  eventId: string
  readOnly: boolean
  creating: boolean
  onCreatePipeline: () => void
}

const ROWS: Array<{ key: keyof StageMapping; label: string; allowNone?: boolean }> = [
  { key: 'entry_stage_id', label: 'Nova inscrição' },
  { key: 'confirmed_stage_id', label: 'Confirmou presença', allowNone: true },
  { key: 'present_stage_id', label: 'Fez check-in', allowNone: true },
  { key: 'absent_stage_id', label: 'Sem check-in até o fim', allowNone: true },
]

export const PipelineSection = ({ eventId, readOnly, creating, onCreatePipeline }: PipelineSectionProps) => {
  const { control, setValue } = useFormContext<EditorValues>()
  const values = useWatch({ control })
  const pipelineId = values.pipeline_id ?? ''
  const { data: pipelines } = usePipelines()
  // Sem pipeline o hook cai no pipeline ativo do kanban: filtra para nao mostrar etapa alheia.
  const { data: rawStages } = usePipelineStages(pipelineId || null)
  const stages = (rawStages ?? []).filter((s) => s.pipeline_id === pipelineId)
  const counts = useEventDealCounts(eventId, 'stage_id', stages.map((s) => s.id))
  // Trocou o pipeline: assim que as etapas chegam, mapeia pelo slug.
  const mapFor = useRef<string | null>(null)

  useEffect(() => {
    if (!mapFor.current || mapFor.current !== pipelineId || stages.length === 0) return
    const m = autoMapStages(stages)
    for (const r of ROWS) setValue(r.key, m[r.key], { shouldDirty: true })
    mapFor.current = null
  }, [pipelineId, stages, setValue])

  const changePipeline = (id: string) => {
    setValue('pipeline_id', id, { shouldDirty: true })
    for (const r of ROWS) setValue(r.key, '', { shouldDirty: true })
    mapFor.current = id
  }

  return (
    <EditorSection title="Pipeline" description="Para onde vai o negócio de cada inscrito e como ele anda.">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Select value={pipelineId || undefined} onValueChange={changePipeline}>
            <SelectTrigger aria-label="Pipeline"><SelectValue placeholder="Escolha o pipeline" /></SelectTrigger>
            <SelectContent>
              {(pipelines ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" onClick={onCreatePipeline} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar pipeline para este evento
          </Button>
        )}
      </div>
      {pipelineId && (
        <div className="space-y-2">
          {ROWS.map((r) => (
            <StageSelect key={r.key} label={r.label} value={values[r.key] ?? ''} stages={stages} allowNone={r.allowNone}
              count={counts.data?.[values[r.key] ?? '']} onChange={(id) => setValue(r.key, id, { shouldDirty: true })} />
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3rem] items-center gap-2 text-sm">
            <span>Cancelou a inscrição</span>
            <span className="rounded-md border px-3 py-2 text-muted-foreground">Marcar como perdido</span>
            <span />
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Mudar o pipeline não move negócios já criados.</p>
    </EditorSection>
  )
}
