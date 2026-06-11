import { useState, useMemo, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { usePipelines } from '@/hooks/use-pipelines'
import { usePipelineAccessFor, useSetPipelineAccess } from '@/hooks/use-pipeline-access'

interface PipelineAccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { user_id: string; name: string } | null
}

const PipelineAccessModal = ({ open, onOpenChange, member }: PipelineAccessModalProps) => {
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines()
  const { data: currentAccess, isLoading: accessLoading } = usePipelineAccessFor(
    open ? member?.user_id : undefined
  )
  const setPipelineAccess = useSetPipelineAccess()
  const isLoading = pipelinesLoading || accessLoading

  const hasRestriction = currentAccess && currentAccess.length > 0

  // Derive initial selection from server data; track local edits separately
  const initialSet = useMemo(
    () => new Set(currentAccess ?? []),
    [currentAccess]
  )
  const [localEdits, setLocalEdits] = useState<Map<string, boolean>>(new Map())

  // Reset local edits when modal opens/closes or server data changes
  const editKey = `${open}-${member?.user_id}-${currentAccess?.join(',')}`
  const [prevEditKey, setPrevEditKey] = useState(editKey)
  if (editKey !== prevEditKey) {
    setPrevEditKey(editKey)
    setLocalEdits(new Map())
  }

  const isChecked = useCallback(
    (pipelineId: string) => {
      if (localEdits.has(pipelineId)) return localEdits.get(pipelineId)!
      return initialSet.has(pipelineId)
    },
    [localEdits, initialSet]
  )

  const selectedIds = useMemo(() => {
    if (!pipelines) return []
    return pipelines.filter((p) => isChecked(p.id)).map((p) => p.id)
  }, [pipelines, isChecked])

  const handleToggle = (pipelineId: string) => {
    setLocalEdits((prev) => {
      const next = new Map(prev)
      const current = isChecked(pipelineId)
      next.set(pipelineId, !current)
      return next
    })
  }

  const handleSave = () => {
    if (!member) return
    setPipelineAccess.mutate(
      { userId: member.user_id, pipelineIds: selectedIds },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  const handleClearRestriction = () => {
    if (!member) return
    setPipelineAccess.mutate(
      { userId: member.user_id, pipelineIds: [] },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  const showUnrestrictedHint = !hasRestriction && selectedIds.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acesso a Pipelines</DialogTitle>
          <DialogDescription>
            Selecione os pipelines que <strong>{member?.name}</strong> pode visualizar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {showUnrestrictedHint && (
              <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Sem restricao: este vendedor ve todos os pipelines. Marque apenas os que deseja liberar para restringir o acesso.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {pipelines?.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border border-border/20 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-smooth"
                >
                  <Checkbox
                    checked={isChecked(p.id)}
                    onCheckedChange={() => handleToggle(p.id)}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {hasRestriction && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-xs text-muted-foreground"
              onClick={handleClearRestriction}
              disabled={setPipelineAccess.isPending}
            >
              Remover restricao
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setPipelineAccess.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={setPipelineAccess.isPending || isLoading}>
            {setPipelineAccess.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { PipelineAccessModal }
