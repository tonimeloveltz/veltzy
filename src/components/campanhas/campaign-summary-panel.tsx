import { Fragment } from 'react'
import { FileText, Music, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export interface SummaryMedia {
  type: 'image' | 'audio' | 'video' | 'document'
  name: string
  url: string
}

export interface CampaignSummary {
  name: string
  audienceCount: number | undefined
  audienceLoading: boolean
  /** Texto da mensagem (livre ou corpo do template). */
  previewText: string
  /** Total de versões (inclui a original); 0 ou 1 = sem versões. */
  versions: number
  media: SummaryMedia | null
  showSender: boolean
  senderLabel: string | null
  whenLabel: string
  estimate: string | null
}

interface CampaignSummaryPanelProps {
  summary: CampaignSummary
  /** Mobile: bloco enxuto acima dos botões (sem prévia). */
  compact?: boolean
  className?: string
}

const VAR_SPLIT = /(\{\{\s*[^}]+\s*\}\})/g

// Variáveis {{x}} em destaque; quebras de linha preservadas pelo whitespace-pre-wrap.
const PreviewText = ({ text }: { text: string }) => (
  <>
    {text.split(VAR_SPLIT).map((part, i) =>
      i % 2 === 1 ? <span key={i} className="font-medium">{part}</span> : <Fragment key={i}>{part}</Fragment>,
    )}
  </>
)

const MediaPreview = ({ media }: { media: SummaryMedia }) => {
  if (media.type === 'image') {
    return <img src={media.url} alt={media.name} className="mb-2 max-h-40 w-full rounded-md object-cover" />
  }
  const Icon = media.type === 'video' ? Video : media.type === 'audio' ? Music : FileText
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{media.name}</span>
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
)

export function CampaignSummaryPanel({ summary: s, compact = false, className }: CampaignSummaryPanelProps) {
  const hasPreview = s.previewText.trim() !== '' || s.media

  return (
    <Card className={cn('space-y-4 p-4', className)}>
      {!compact && (
        <p className="truncate text-base font-semibold">{s.name.trim() || 'Nova campanha'}</p>
      )}

      <div className="space-y-0.5">
        {s.audienceLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <p className="text-sm"><strong className="text-base">{s.audienceCount ?? 0}</strong> contatos vão receber</p>
        )}
        <p className="text-xs text-muted-foreground">Sem quem pediu para não receber e sem telefone</p>
      </div>

      {!compact && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Mensagem</p>
          {hasPreview ? (
            <div className="rounded-lg bg-muted p-3 text-sm">
              {s.media && <MediaPreview media={s.media} />}
              <p className="whitespace-pre-wrap break-words"><PreviewText text={s.previewText} /></p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">A prévia aparece aqui.</p>
          )}
          {s.versions > 1 && <p className="text-xs text-muted-foreground">{s.versions} versões</p>}
        </div>
      )}

      <div className="space-y-1.5 border-t pt-3">
        {s.showSender && <Row label="Número de envio" value={s.senderLabel ?? 'Número de cada conversa'} />}
        <Row label="Quando" value={s.whenLabel} />
        {s.estimate && <Row label="Estimativa" value={s.estimate} />}
      </div>
    </Card>
  )
}
