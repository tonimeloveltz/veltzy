import { cn } from '@/lib/utils'
import type { RecipientDetail } from '@/services/campaigns.service'
import type { BlastRecipientStatus } from '@/types/database'

interface CampaignSummaryCardsProps {
  recipients: RecipientDetail[]
}

const statusMeta: { key: BlastRecipientStatus | 'total'; label: string; tone: string }[] = [
  { key: 'total', label: 'Total', tone: 'text-foreground' },
  { key: 'sent', label: 'Enviados', tone: 'text-emerald-600' },
  { key: 'queued', label: 'Na fila', tone: 'text-amber-600' },
  { key: 'failed', label: 'Falhas', tone: 'text-red-600' },
  { key: 'skipped', label: 'Pulados', tone: 'text-muted-foreground' },
]

/** Agregados derivados dos RECIPIENTS por status (fonte viva, nao dos counts da campanha). */
export function CampaignSummaryCards({ recipients }: CampaignSummaryCardsProps) {
  const counts = recipients.reduce(
    (acc, r) => {
      acc.total += 1
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    { total: 0 } as Record<string, number>,
  )

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {statusMeta.map((m) => (
        <div key={m.key} className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', m.tone)}>
            {counts[m.key] ?? 0}
          </p>
        </div>
      ))}
    </div>
  )
}
