import { useState } from 'react'
import { Workflow, Plus, AlertCircle, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useCadences, useCadenceRuns, useToggleCadence } from '@/hooks/use-cadences'
import { CadenceForm } from '@/components/cadencias/cadence-form'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetTitle,
} from '@/components/ui/sheet'
import type { Cadence, CadenceRunStatus } from '@/types/database'

const runStatusLabel: Record<CadenceRunStatus, string> = {
  active: 'Ativo', completed: 'Concluído', cancelled: 'Cancelado', failed: 'Falhou',
}
const runStatusTone: Record<CadenceRunStatus, string> = {
  active: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-emerald-500/15 text-emerald-600',
  cancelled: 'bg-muted text-muted-foreground',
  failed: 'bg-red-500/15 text-red-600',
}

function triggerLabel(c: Cadence): string {
  if (!c.trigger_event) return 'Manual'
  return `Evento: ${c.trigger_event}`
}

function RunsSheet({ cadence, onClose }: { cadence: Cadence | null; onClose: () => void }) {
  const { data: runs, isLoading } = useCadenceRuns(cadence?.id ?? null)
  return (
    <Sheet open={!!cadence} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetTitle>Acompanhamento — {cadence?.name}</SheetTitle>
        <div className="mt-4 space-y-2">
          {isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)
          ) : !runs?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum lead nesta cadência ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Passo</th><th className="px-3 py-2">Motivo</th></tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.lead_name ?? r.lead_id.slice(0, 8)}</td>
                      <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', runStatusTone[r.status])}>{runStatusLabel[r.status]}</span></td>
                      <td className="px-3 py-2 tabular-nums">{r.current_step}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.cancel_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function CadenciasPage() {
  const features = useAuthStore((s) => s.company?.features)
  const [formOpen, setFormOpen] = useState(false)
  const [selected, setSelected] = useState<Cadence | null>(null)
  const { data: cadences, isLoading } = useCadences()
  const toggle = useToggleCadence()

  if (!features?.mkt_ativo_enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Cadências não habilitadas</h2>
        <p className="max-w-sm text-sm text-muted-foreground">A automação de cadências não está liberada para esta empresa.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Cadências</h1>
            <p className="text-sm text-muted-foreground">Sequências automáticas de mensagens (drip)</p>
          </div>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nova cadência</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !cadences?.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-20 text-center">
          <Workflow className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma cadência ainda</p>
          <p className="text-sm text-muted-foreground">Crie uma sequência de nutrição automática.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Cadência</th>
                <th className="px-4 py-2.5 font-medium">Gatilho</th>
                <th className="px-4 py-2.5 font-medium">Ativa</th>
                <th className="px-4 py-2.5 font-medium text-right">Acompanhar</th>
              </tr>
            </thead>
            <tbody>
              {cadences.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{triggerLabel(c)}</td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={c.is_enabled}
                      onCheckedChange={(v) => toggle.mutate({ id: c.id, isEnabled: v })}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(c)}>
                      <Users className="mr-1.5 h-4 w-4" /> Runs
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CadenceForm open={formOpen} onOpenChange={setFormOpen} />
      <RunsSheet cadence={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
