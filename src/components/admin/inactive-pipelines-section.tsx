import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReactivatePipeline } from '@/hooks/use-pipelines'
import type { Pipeline } from '@/types/database'

interface InactivePipelineRowProps {
  pipeline: Pipeline
  onReactivated: (id: string) => void
}

// Uma mutation por linha: o spinner fica so no botao clicado.
const InactivePipelineRow = ({ pipeline, onReactivated }: InactivePipelineRowProps) => {
  const reactivate = useReactivatePipeline()

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/20 p-2">
      <div className="h-6 w-1 rounded-full shrink-0" style={{ backgroundColor: pipeline.color }} />
      <span className="flex-1 text-xs text-muted-foreground truncate">{pipeline.name}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs shrink-0"
        disabled={reactivate.isPending}
        onClick={() => reactivate.mutate(pipeline.id, { onSuccess: () => onReactivated(pipeline.id) })}
      >
        {reactivate.isPending
          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
          : <RotateCcw className="h-3 w-3 mr-1" />}
        Reativar
      </Button>
    </div>
  )
}

interface InactivePipelinesSectionProps {
  pipelines: Pipeline[]
  onReactivated: (id: string) => void
}

const InactivePipelinesSection = ({ pipelines, onReactivated }: InactivePipelinesSectionProps) => {
  const [open, setOpen] = useState(false)

  if (pipelines.length === 0) return null

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div className="pt-2 space-y-2">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-smooth"
        onClick={() => setOpen((v) => !v)}
      >
        <Chevron className="h-3 w-3" />
        Desativados ({pipelines.length})
      </button>
      {open && pipelines.map((p) => (
        <InactivePipelineRow key={p.id} pipeline={p} onReactivated={onReactivated} />
      ))}
    </div>
  )
}

export { InactivePipelinesSection }
