import { useState } from 'react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import { Download, FileText, AlertTriangle, MapPin, User, ImageOff } from 'lucide-react'
import { AudioBubble } from '@/components/inbox/audio-bubble'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Message } from '@/types/database'

interface MessageBubbleProps {
  message: Message
  senderName?: string
}

const MediaFallback = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs text-muted-foreground">
    <ImageOff className="h-4 w-4 shrink-0" />
    <span>{label}</span>
  </div>
)

const MediaImage = ({ src, alt, maxWidth = 'max-w-[240px]' }: { src: string; alt: string; maxWidth?: string }) => {
  const [error, setError] = useState(false)
  if (error) return <MediaFallback label="Midia indisponivel" />
  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img
        src={src}
        alt={alt}
        className={`${maxWidth} rounded-lg`}
        loading="lazy"
        onError={() => setError(true)}
      />
    </a>
  )
}

const MediaVideo = ({ src }: { src: string }) => {
  const [error, setError] = useState(false)
  if (error) return <MediaFallback label="Video indisponivel" />
  return (
    <video
      controls
      src={src}
      className="max-w-[280px] rounded-lg"
      onError={() => setError(true)}
    />
  )
}

const LocationCard = ({ content }: { content: string }) => {
  const coords = content.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  const lat = coords?.[1]
  const lng = coords?.[2]
  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null

  return (
    <a
      href={mapsUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs hover:bg-background transition-smooth"
    >
      <MapPin className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <span className="font-medium">Localizacao recebida</span>
        {lat && lng && <p className="text-muted-foreground truncate">{lat}, {lng}</p>}
      </div>
    </a>
  )
}

const ContactCard = ({ content }: { content: string }) => {
  const lines = content.split('\n')
  const name = lines[0] ?? 'Contato'
  const phone = lines[1] ?? null

  return (
    <div className="flex items-center gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs">
      <User className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <span className="font-medium">{name}</span>
        {phone && <p className="text-muted-foreground truncate">{phone}</p>}
      </div>
    </div>
  )
}

const MediaContent = ({ message }: { message: Message }) => {
  switch (message.message_type) {
    case 'image':
      if (!message.file_url) return <MediaFallback label="Imagem indisponivel" />
      return <MediaImage src={message.file_url} alt="imagem" />
    case 'sticker':
      if (!message.file_url) return <MediaFallback label="Sticker indisponivel" />
      return <MediaImage src={message.file_url} alt="figurinha" maxWidth="max-w-[160px]" />
    case 'audio':
      return (
        <AudioBubble
          fileUrl={message.file_url ?? ''}
          transcription={message.content || null}
        />
      )
    case 'video':
      if (!message.file_url) return <MediaFallback label="Video indisponivel" />
      return <MediaVideo src={message.file_url} />
    case 'document':
      if (!message.file_url) return <MediaFallback label="Documento indisponivel" />
      return (
        <a
          href={message.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-background/50 px-3 py-2 text-xs hover:bg-background transition-smooth"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1">{message.file_name ?? 'documento'}</span>
          <Download className="h-3.5 w-3.5 shrink-0" />
        </a>
      )
    case 'location':
      return <LocationCard content={message.content} />
    case 'contact':
      return <ContactCard content={message.content} />
    default:
      // Fallback universal: tipo desconhecido nunca fica invisivel
      return (
        <div className="rounded-lg bg-background/50 px-3 py-2 text-xs text-muted-foreground italic">
          Mensagem nao suportada neste formato
        </div>
      )
  }
}

const MessageBubble = ({ message, senderName }: MessageBubbleProps) => {
  const isLead = message.sender_type === 'lead'
  const isAi = message.sender_type === 'ai'
  const isHuman = message.sender_type === 'human'
  const isOptimistic = message.id.startsWith('optimistic-')

  return (
    <div className={cn('flex', isLead ? 'justify-start' : 'justify-end', isOptimistic && 'opacity-70')}>
      <div
        className={cn(
          'max-w-[75%] space-y-1 px-3 py-2 rounded-xl',
          isLead && 'bg-muted text-foreground rounded-bl-sm',
          isHuman && 'bg-primary text-primary-foreground rounded-br-sm',
          isAi && 'bg-accent text-accent-foreground rounded-bl-sm border border-primary/20',
        )}
      >
        {isHuman && senderName && (
          <p className="text-[10px] font-medium opacity-70">{senderName}</p>
        )}
        {isAi && (
          <p className="text-[10px] font-medium opacity-70">IA SDR</p>
        )}

        {message.message_type !== 'text' && <MediaContent message={message} />}

        {message.content && !['audio', 'location', 'contact'].includes(message.message_type) && (
          <p className={cn(
            'whitespace-pre-wrap break-words',
            message.message_type === 'text' ? 'text-sm' : 'text-xs opacity-70',
          )}>{message.content}</p>
        )}

        {message.message_type === 'text' && !message.content && (
          <p className="text-sm italic opacity-50">[mensagem]</p>
        )}

        <p className={cn('text-[10px] text-right flex items-center justify-end gap-1', isLead ? 'opacity-40' : 'opacity-60')}>
          {timeAgo(message.created_at)}
          {message.delivery_status === 'failed' && (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-3 w-3 text-destructive inline" />
              </TooltipTrigger>
              <TooltipContent>Mensagem nao entregue - instancia offline</TooltipContent>
            </Tooltip>
          )}
        </p>
      </div>
    </div>
  )
}

export { MessageBubble }
