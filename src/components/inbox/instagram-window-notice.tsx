import { AlertTriangle, Clock } from 'lucide-react'
import { INSTAGRAM_WINDOW_CLOSED_MESSAGE } from '@/lib/instagram-messages'
import type { InstagramWindowState } from '@/lib/lead-channel'

interface InstagramWindowNoticeProps {
  state: InstagramWindowState
  remainingMs: number
}

const HOUR_MS = 60 * 60 * 1000

/** Aviso da janela de 24h da Meta. Aproximacao de UX: o instagram-send e a autoridade. */
const InstagramWindowNotice = ({ state, remainingMs }: InstagramWindowNoticeProps) => {
  if (state === 'open') return null

  if (state === 'closing') {
    const hours = Math.max(1, Math.ceil(remainingMs / HOUR_MS))
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>A janela de resposta do Instagram fecha em {hours}h</span>
      </div>
    )
  }

  return (
    <div className="mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{INSTAGRAM_WINDOW_CLOSED_MESSAGE}</span>
    </div>
  )
}

export { InstagramWindowNotice }
