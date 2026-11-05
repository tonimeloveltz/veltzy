import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CampaignPhonePreview, type PreviewMedia } from '@/components/campanhas/campaign-phone-preview'

export type SummaryMedia = PreviewMedia

export interface CampaignSummary {
  name: string
  audienceCount: number | undefined
  audienceLoading: boolean
  /** Texto da mensagem: original + versões (livre) ou corpo do template. */
  previewTexts: string[]
  /** variable_mapping do template; null no texto livre. */
  previewMapping: Record<string, string> | null
  media: SummaryMedia | null
  showSender: boolean
  senderLabel: string | null
  whenLabel: string
  estimate: string | null
}

interface CampaignSummaryPanelProps {
  summary: CampaignSummary
  /** Mobile: bloco acima dos botões, sem o nome da campanha. */
  compact?: boolean
  className?: string
  /** Passo 1 (Destinatários): ainda não há mensagem, então sem o celular. */
  showPreview?: boolean
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
)

export function CampaignSummaryPanel({ summary: s, compact = false, className, showPreview = true }: CampaignSummaryPanelProps) {
  return (
    <Card className={cn('space-y-4 p-4', className)}>
      {!compact && (
        <p className="truncate text-base font-semibold">{s.name.trim() || 'Nova campanha'}</p>
      )}

      {showPreview && <CampaignPhonePreview texts={s.previewTexts} mapping={s.previewMapping} media={s.media} />}

      <div className={cn('space-y-1.5', showPreview && 'border-t pt-3')}>
        <div className="space-y-0.5 pb-1">
          {s.audienceLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <p className="text-sm"><strong className="text-base">{s.audienceCount ?? 0}</strong> contatos vão receber</p>
          )}
          <p className="text-xs text-muted-foreground">Sem quem pediu para não receber e sem telefone</p>
        </div>
        {s.showSender && <Row label="Número de envio" value={s.senderLabel ?? 'Número de cada conversa'} />}
        <Row label="Quando" value={s.whenLabel} />
        {s.estimate && <Row label="Estimativa" value={s.estimate} />}
      </div>
    </Card>
  )
}
