import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCheck, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { documentMeta, parseWhatsAppFormatting, renderPreviewText, SAMPLE_LEAD } from '@/lib/campaign-preview'
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
  /** Bloco compacto (mobile): janela mais baixa. */
  compact?: boolean
  className?: string
}

// Padrão sutil de conversa a partir de token (sem imagem externa).
const CHAT_BG = {
  backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)',
  backgroundSize: '14px 14px',
}

const nowLabel = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const Ticks = ({ time }: { time: string }) => (
  <span className="inline-flex items-center gap-0.5 text-[10px] leading-none opacity-70">
    {time}
    <CheckCheck className="h-3 w-3" />
  </span>
)

// Hora + ✓✓ flutuam à direita na última linha do texto (como no WhatsApp); sem texto,
// ficam numa linha própria embaixo da mídia.
const Bubble = ({ children, caption, time }: { children?: ReactNode; caption?: ReactNode; time: string }) => (
  <div className="flex justify-end">
    <div className="message-bubble-human max-w-[85%] space-y-1 rounded-lg rounded-br-sm px-3 py-2">
      {children}
      {caption ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-snug [overflow-wrap:anywhere]">
          {caption}
          <span className="float-right ml-2 mt-1.5"><Ticks time={time} /></span>
        </p>
      ) : (
        <p className="flex justify-end"><Ticks time={time} /></p>
      )}
    </div>
  </div>
)

// Variáveis já trocadas pelo contato de exemplo; formatação do WhatsApp aplicada.
const captionOf = (text: string, mapping: Record<string, string> | null): ReactNode =>
  parseWhatsAppFormatting(renderPreviewText(text, mapping)).map((r, i) => (
    <span key={i} className={cn(r.bold && 'font-semibold', r.italic && 'italic', r.strike && 'line-through')}>{r.text}</span>
  ))

const DocumentCard = ({ media }: { media: PreviewMedia }) => (
  <div className="flex items-center gap-2 rounded-lg bg-background/20 px-2 py-2">
    <FileText className="h-7 w-7 shrink-0" />
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{media.name}</p>
      <p className="text-[10px] opacity-70">{documentMeta(media.name, media.size)}</p>
    </div>
  </div>
)

/** Janela de chat (proporção de celular) com a conversa como o contato vai ver. */
export function CampaignPhonePreview({ texts, mapping, media, compact = false, className }: CampaignPhonePreviewProps) {
  const [picked, setPicked] = useState(0)
  const index = picked < texts.length ? picked : 0
  const text = (texts[index] ?? '').trim()
  const time = nowLabel()
  const isEmpty = !text && !media
  const caption = text ? captionOf(text, mapping) : null

  // Mensagem mais recente sempre visível: rola para o fim quando o conteúdo muda.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text, media])

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

      <div className={cn('flex w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm', compact ? 'h-[360px]' : 'h-[480px]')}>
        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {SAMPLE_LEAD.first_name[0]}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{SAMPLE_LEAD.name}</p>
            <p className="text-[11px] text-muted-foreground">online</p>
          </div>
        </div>

        <div ref={scrollRef} className="scrollbar-minimal flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted p-3" style={CHAT_BG}>
          {/* mt-auto ancora as bolhas embaixo sem cortar o topo quando rola. */}
          <div className="mt-auto space-y-1.5">
            {isEmpty && <p className="pb-24 text-center text-xs text-muted-foreground">A prévia aparece aqui.</p>}

            {/* Anexo sempre em mensagem própria, depois do texto (sem legenda). */}
            {caption && <Bubble time={time} caption={caption} />}
            {media && (
              <Bubble time={time}>
                {media.type === 'image' && <MediaImage src={media.url} alt={media.name} maxWidth="max-w-full" />}
                {media.type === 'video' && <MediaVideo src={media.url} maxWidth="max-w-full" />}
                {media.type === 'document' && <DocumentCard media={media} />}
                {media.type === 'audio' && <AudioBubble fileUrl={media.url} transcription={null} hideTranscription />}
              </Bubble>
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">Exemplo de como o contato vai ver</p>
    </div>
  )
}
