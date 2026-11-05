import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAllPipelineStages } from '@/hooks/use-pipeline-stages'
import { useInactivePipelines, usePipelines } from '@/hooks/use-pipelines'
import { Checkbox } from '@/components/ui/checkbox'

interface StageGroupSelectProps {
  value: string[]
  onChange: (stageIds: string[]) => void
}

interface StageGroup {
  pipelineId: string
  title: string
  stages: { id: string; name: string }[]
}

/**
 * Etapas agrupadas por funil em blocos recolhíveis (wizard de campanha). Mesma fonte e
 * mesmo contrato do StageMultiSelect: funis ativos + etapas já marcadas de funil desativado.
 */
export function StageGroupSelect({ value, onChange }: StageGroupSelectProps) {
  const { data: stages } = useAllPipelineStages()
  const { data: pipelines } = usePipelines()
  const { data: inactivePipelines } = useInactivePipelines()
  // Aberto/fechado escolhido pelo usuário; sem escolha, abre se tiver marcada ou se for funil único.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

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

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma etapa configurada.</p>
  }

  const keepOpen = (pipelineId: string) => setOpenMap((m) => ({ ...m, [pipelineId]: true }))

  const toggle = (g: StageGroup, id: string, on: boolean) => {
    keepOpen(g.pipelineId)
    onChange(on ? [...value, id] : value.filter((v) => v !== id))
  }

  const setGroup = (g: StageGroup, on: boolean) => {
    keepOpen(g.pipelineId)
    const ids = new Set(g.stages.map((s) => s.id))
    const rest = value.filter((v) => !ids.has(v))
    onChange(on ? [...rest, ...ids] : rest)
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const count = g.stages.filter((s) => value.includes(s.id)).length
        const all = count === g.stages.length
        return (
          <details
            key={g.pipelineId}
            open={openMap[g.pipelineId] ?? (groups.length === 1 || count > 0)}
            onToggle={(e) => {
              const isOpen = e.currentTarget.open
              setOpenMap((m) => (m[g.pipelineId] === isOpen ? m : { ...m, [g.pipelineId]: isOpen }))
            }}
            className="group rounded-lg border"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition group-open:rotate-0" />
              <span className="flex-1 truncate text-sm font-medium">{g.title}</span>
              {count > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {count} {count === 1 ? 'selecionada' : 'selecionadas'}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setGroup(g, !all) }}
                className="text-xs font-medium text-primary hover:underline"
              >
                {all ? 'Limpar' : 'Marcar todas'}
              </button>
            </summary>
            <div className="grid grid-cols-1 gap-2 border-t px-3 py-3 sm:grid-cols-2">
              {g.stages.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={value.includes(s.id)} onCheckedChange={(c) => toggle(g, s.id, c === true)} />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
