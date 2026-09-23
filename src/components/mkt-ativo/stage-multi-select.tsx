import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useAllPipelineStages } from '@/hooks/use-pipeline-stages'
import { usePipelines } from '@/hooks/use-pipelines'

interface Props {
  value: string[]
  onChange: (stageIds: string[]) => void
}

/**
 * Seletor multi-etapa ACHATADO (mkt-ativo · segmentação por etapa). Lista todos os
 * stages de todos os pipelines da company, cada um com label "Pipeline / Stage"
 * (desambigua stages homônimos). Critério de aplicação = deal aberto mais recente
 * (resolvido no backend). Sem seleção = sem filtro de etapa.
 */
export function StageMultiSelect({ value, onChange }: Props) {
  const { data: stages } = useAllPipelineStages()
  const { data: pipelines } = usePipelines()

  const options = useMemo(() => {
    const pipeName = new Map((pipelines ?? []).map((p) => [p.id, p.name]))
    return (stages ?? []).map((s) => ({
      id: s.id,
      label: `${pipeName.get(s.pipeline_id) ?? 'Pipeline'} / ${s.name}`,
    }))
  }, [stages, pipelines])

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma etapa configurada.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition',
              on ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
