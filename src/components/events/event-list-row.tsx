import { useNavigate } from 'react-router-dom'
import { Progress } from '@/components/ui/progress'
import { EventStatusBadge } from '@/components/events/event-status-badge'
import { EventRowActions } from '@/components/events/event-row-actions'
import {
  capacityPercent, eventDateBlock, eventSummaryLine, showAttendance, type EventListItem,
} from '@/lib/events/event-list'
import type { EventCounts } from '@/services/events.service'

interface EventListRowProps {
  event: EventListItem
  counts: EventCounts | undefined
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-[72px] text-right">
    <p className="text-sm font-semibold tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
)

export const EventListRow = ({ event, counts }: EventListRowProps) => {
  const navigate = useNavigate()
  const date = eventDateBlock(event.starts_at, event.timezone)
  const registered = counts?.registered
  const percent = registered !== undefined ? capacityPercent(registered, event.capacity) : null
  const fmt = (n: number | undefined) => (n === undefined ? '...' : String(n))

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/eventos/${event.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/eventos/${event.id}`) }}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 transition-smooth hover:bg-accent/40 md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
          {date ? (
            <>
              <span className="text-lg font-bold leading-none">{date.day}</span>
              <span className="text-xs uppercase">{date.month}</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground">Sem data</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{event.title}</p>
            <EventStatusBadge status={event.status} closedReason={event.closed_reason} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{eventSummaryLine(event)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 md:justify-end">
        <div className="w-36">
          <p className="text-sm tabular-nums">
            <span className="font-semibold">{fmt(registered)}</span>
            <span className="text-muted-foreground">
              {event.capacity ? ` / ${event.capacity}` : ' / sem limite'}
            </span>
          </p>
          {percent !== null && <Progress value={percent} className="mt-1 h-1.5" />}
          <p className="text-xs text-muted-foreground">inscritos</p>
        </div>
        <Stat label="confirmados" value={fmt(counts?.confirmed)} />
        <Stat label="presentes" value={showAttendance(event.starts_at) ? fmt(counts?.attended) : '-'} />
        <EventRowActions event={event} />
      </div>
    </div>
  )
}
