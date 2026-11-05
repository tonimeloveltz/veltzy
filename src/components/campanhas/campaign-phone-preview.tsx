import { useState, type ReactNode } from 'react'
import { CheckCheck, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { documentMeta, renderPreviewSegments, SAMPLE_LEAD } from '@/lib/campaign-preview'
import { AudioBubble } from '@/components/inbox/audio-bubble'
import { MediaImage, MediaVideo } from '@/components/inbox/message-bubble'

export interface PreviewMedia {
  type: 'image' | 'audio' | 'video' | 'document'
  name: string
  url: string
  size?: number
}

interface CampaignPhonePreviewProps {
  /** Original + versões (uma bolha por vez, escolhida no seletor). */
  texts: string[]
  /** variable_mapping do template ({{n}}); null no texto livre. */
  mapping: Record<string, string> | null
  media: PreviewMedia | null
  className?: string
}

// Padrão sutil de conversa a partir de token (sem imagem externa).
const CHAT_BG = {
  backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)',
  backgroundSize: '14px 14px',
}

const nowLabel = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const Bubble = ({ children, time }: { children: ReactNode; time: string }) => (
  <div className="flex justify-end">
    <div className="message-bubble-human max-w-[85%] space-y-1 px-2.5 py-1.5">
      {children}
      <p className="flex items-center justify-end gap-1 text-[10px] opacity-70">
        {time}
        <CheckCheck className="h-3 w-3" />
      </p>
    </div>
  </div>
)

const BubbleText = ({ text, mapping }: { text: string; mapping: Record<string, string> | null }) => (
  <p className="whitespace-pre-wrap break-words text-sm">
    {renderPreviewSegments(text, mapping).map((s, i) =>
      s.isVar ? <strong key={i} className="font-semibold">{s.text}</strong> : <span key={i}>{s.text}</span>,
    )}
  </p>
)

const DocumentCard = ({ media }: { media: PreviewMedia }) => (
  <div className="flex items-center gap-2 rounded-lg bg-background/20 px-2 py-2">
    <FileText className="h-7 w-7 shrink-0" />
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{media.name}</p>
      <p className="text-[10px] opacity-70">{documentMeta(media.name, media.size)}</p>
    </div>
  </div>
)

/** Mockup de celular com a conversa como o contato vai ver. */
export function CampaignPhonePreview({ texts, mapping, media, className }: CampaignPhonePreviewProps) {
  const [picked, setPicked] = useState(0)
  const index = picked < texts.length ? picked : 0
  const text = (texts[index] ?? '').trim()
  const time = nowLabel()
  const isEmpty = !text && !media

  return (
    <div className={cn('space-y-2', className)}>
      {texts.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {texts.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs',
                i === index ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Versão {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[2rem] border-[6px] border-foreground/80 bg-card shadow-md">
        <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {SAMPLE_LEAD.first_name[0]}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{SAMPLE_LEAD.name}</p>
            <p className="text-[11px] text-muted-foreground">online</p>
          </div>
        </div>

        <div className="min-h-[220px] space-y-1.5 bg-muted p-3" style={CHAT_BG}>
          {isEmpty && <p className="pt-16 text-center text-xs text-muted-foreground">A prévia aparece aqui.</p>}

          {/* Áudio não leva legenda: o texto vai antes, em outra mensagem. */}
          {media?.type === 'audio' ? (
            <>
              {text && <Bubble time={time}><BubbleText text={text} mapping={mapping} /></Bubble>}
              <Bubble time={time}><AudioBubble fileUrl={media.url} transcription={null} hideTranscription /></Bubble>
            </>
          ) : media ? (
            <Bubble time={time}>
              {media.type === 'image' && <MediaImage src={media.url} alt={media.name} maxWidth="max-w-full" />}
              {media.type === 'video' && <MediaVideo src={media.url} maxWidth="max-w-full" />}
              {media.type === 'document' && <DocumentCard media={media} />}
              {text && <BubbleText text={text} mapping={mapping} />}
            </Bubble>
          ) : text ? (
            <Bubble time={time}><BubbleText text={text} mapping={mapping} /></Bubble>
          ) : null}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">Exemplo de como o contato vai ver</p>
    </div>
  )
}
