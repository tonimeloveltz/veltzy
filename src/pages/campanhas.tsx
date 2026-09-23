import { useState } from 'react'
import { Megaphone, Plus, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useCampaigns } from '@/hooks/use-campaigns'
import { CampaignWizard } from '@/components/campanhas/campaign-wizard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BlastCampaignStatus } from '@/types/database'

const statusLabel: Record<BlastCampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  queued: 'Na fila',
  running: 'Enviando',
  completed: 'Concluída',
  failed: 'Falhou',
  paused: 'Pausada',
  cancelled: 'Cancelada',
}

const statusTone: Record<BlastCampaignStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-500/15 text-blue-600',
  queued: 'bg-amber-500/15 text-amber-600',
  running: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
  paused: 'bg-amber-500/15 text-amber-600',
  cancelled: 'bg-muted text-muted-foreground',
}

const StatusBadge = ({ status }: { status: BlastCampaignStatus }) => (
  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusTone[status])}>
    {statusLabel[status]}
  </span>
)

export default function CampanhasPage() {
  const features = useAuthStore((s) => s.company?.features)
  const [wizardOpen, setWizardOpen] = useState(false)
  const { data: campaigns, isLoading } = useCampaigns()

  // Gate de UI (o gate autoritativo e server-side na edge blast-dispatch).
  if (!features?.mkt_ativo_enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Campanhas não habilitadas</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          O disparo em massa não está liberado para esta empresa. Fale com o administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Campanhas</h1>
            <p className="text-sm text-muted-foreground">Disparo em massa por WhatsApp</p>
          </div>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : !campaigns?.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-20 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhuma campanha ainda</p>
          <p className="text-sm text-muted-foreground">Crie a primeira campanha de disparo em massa.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Campanha</th>
                <th className="px-4 py-2.5 font-medium">Template</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Enviados / Total</th>
                <th className="px-4 py-2.5 font-medium">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.template?.name ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.sent_count} / {c.total_recipients}
                    {c.failed_count > 0 && (
                      <span className="ml-1 text-xs text-red-600">({c.failed_count} falhou)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}
