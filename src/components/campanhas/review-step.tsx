import { Info } from 'lucide-react'
import type { CampaignSummary } from '@/components/campanhas/campaign-summary-panel'

interface ReviewStepProps {
  summary: CampaignSummary
  messageLabel: string
  senderForce: boolean
  isNonOfficial: boolean
}

export function ReviewStep({ summary: s, messageLabel, senderForce, isNonOfficial }: ReviewStepProps) {
  const items: { label: string; value: string }[] = [
    { label: 'Campanha', value: s.name },
    { label: 'Mensagem', value: messageLabel },
    ...(s.showSender
      ? [{ label: 'Número de envio', value: s.senderLabel ? `${s.senderLabel}${senderForce ? ' (todos)' : ''}` : 'Número de cada conversa' }]
      : []),
    { label: 'Destinatários', value: String(s.audienceCount ?? 0) },
    { label: 'Quando', value: s.whenLabel },
    ...(s.estimate ? [{ label: 'Estimativa', value: s.estimate }] : []),
  ]

  return (
    <div className="space-y-4">
      <dl className="divide-y rounded-md border text-sm">
        {items.map((it) => (
          <div key={it.label} className="flex justify-between gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className="text-right font-medium">{it.value}</dd>
          </div>
        ))}
      </dl>
      {isNonOfficial && (
        <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <p>Número não oficial. As pausas de proteção contra bloqueio são aplicadas no envio.</p>
        </div>
      )}
    </div>
  )
}
