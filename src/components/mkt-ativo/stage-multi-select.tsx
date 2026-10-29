import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useAllPipelineStages } from '@/hooks/use-pipeline-stages'
import { useInactivePipelines, usePipelines } from '@/hooks/use-pipelines'

interface Props {
  value: string[]
  onChange: (stageIds: string[]) => void
}

interface StageGroup {
  pipelineId: string
  title: string
  stages: { id: string; name: string }[]
}

/**
 * Seletor multi-etapa AGRUPADO por pipeline ativo (mkt-ativo · segmentação por etapa e
 * filtros de automação). Etapas de pipeline desativado ficam de fora, exceto as que já
 * estão em `value`: essas aparecem num grupo "(desativado)" para poderem ser desmarcadas.
 * Critério de aplicação = deal aberto mais recente (resolvido no backend). Sem seleção =
 * sem filtro de etapa.
 */
export function StageMultiSelect({ value, onChange }: Props) {
  const { data: stages } = useAllPipelineStages()
  const { data: pipelines } = usePipelines()
  const { data: inactivePipelines } = useInactivePipelines()

  const groups = useMemo<StageGroup[]>(() => {
    const byPipeline = new Map<string, { id: string; name: string }[]>()
    for (const s of stages ?? []) {
      const list = byPipeline.get(s.pipeline_id) ?? []
      list.push({ id: s.id, name: s.name })
      byPipeline.set(s.pipeline_id, list)
    }

    const active = (pipelines ?? [])
      .map((p) => ({ pipelineId: p.id, title: p.name, stages: byPipeline.get(p.id) ?? [] }))
      .filter((g) => g.stages.length > 0)

    const selected = new Set(value)
    const inactive = (inactivePipelines ?? [])
      .map((p) => ({
        pipelineId: p.id,
        title: `${p.name} (desativado)`,
        stages: (byPipeline.get(p.id) ?? []).filter((s) => selected.has(s.id)),
      }))
      .filter((g) => g.stages.length > 0)

    return [...active, ...inactive]
  }, [stages, pipelines, inactivePipelines, value])

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma etapa configurada.</p>
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.pipelineId} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{g.title}</p>
          <div className="flex flex-wrap gap-2">
            {g.stages.map((s) => {
              const on = value.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm transition',
                    on ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted',
                  )}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
