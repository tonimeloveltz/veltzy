import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useCampaign, useCampaignRecipients } from '@/hooks/use-campaigns'
import { CampaignSummaryCards } from '@/components/campanhas/campaign-summary-cards'
import { RecipientList } from '@/components/campanhas/recipient-list'
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

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : null)

export default function CampanhaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const features = useAuthStore((s) => s.company?.features)
  const { data: campaign, isLoading } = useCampaign(id)
  const { data: recipients, isLoading: loadingRecipients } = useCampaignRecipients(id)

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

  const BackButton = (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => navigate('/campanhas')}>
      <ArrowLeft className="mr-1.5 h-4 w-4" /> Campanhas
    </Button>
  )

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        {BackButton}
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="space-y-6 p-6">
        {BackButton}
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Campanha não encontrada</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Esta campanha não existe ou não pertence a esta empresa.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {BackButton}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{campaign.name}</h1>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusTone[campaign.status])}>
          {statusLabel[campaign.status]}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>Template: {campaign.template?.name ?? 'Sem template'}</span>
        <span>Criada em {fmtDate(campaign.created_at)}</span>
        {campaign.started_at && <span>Iniciada em {fmtDate(campaign.started_at)}</span>}
        {campaign.completed_at && <span>Concluída em {fmtDate(campaign.completed_at)}</span>}
      </div>

      <CampaignSummaryCards recipients={recipients ?? []} />

      {loadingRecipients ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <RecipientList recipients={recipients ?? []} />
      )}
    </div>
  )
}
