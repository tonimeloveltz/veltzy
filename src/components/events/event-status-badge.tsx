import { cn } from '@/lib/utils'
import { eventStatusBadge, type EventBadgeTone } from '@/lib/events/event-list'
import type { EventClosedReason, EventStatus } from '@/types/events'

const toneClass: Record<EventBadgeTone, string> = {
  success: 'bg-primary/15 text-primary',
  warning: 'bg-accent text-accent-foreground',
  info: 'bg-secondary text-secondary-foreground',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

interface EventStatusBadgeProps {
  status: EventStatus
  closedReason: EventClosedReason | null
  className?: string
}

export const EventStatusBadge = ({ status, closedReason, className }: EventStatusBadgeProps) => {
  const { label, tone } = eventStatusBadge(status, closedReason)
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', toneClass[tone], className)}>
      {label}
    </span>
  )
}
