import { Skeleton } from '@/components/ui/skeleton'
import { StatCards } from '@/components/events/editor/dashboard/stat-cards'
import { PerDayChart } from '@/components/events/editor/dashboard/per-day-chart'
import { Funnel, OriginTable } from '@/components/events/editor/dashboard/origin-and-funnel'
import { useAllEventRegistrations } from '@/hooks/events/use-all-event-registrations'
import { computeEventStats } from '@/lib/events/event-stats'
import type { Event } from '@/types/events'

/** Aba 7: contas em event-stats.ts sobre as inscricoes nao canceladas. */
export const DashboardTab = ({ event }: { event: Event }) => {
  const { data, isLoading } = useAllEventRegistrations(event.id)
  if (isLoading || !data) return <Skeleton className="h-64 w-full" />
  const s = computeEventStats(data, { capacity: event.capacity, createdAt: event.created_at, timeZone: event.timezone })
  return (
    <div className="space-y-4">
      <StatCards s={s} />
      <PerDayChart data={s.perDay} />
      <div className="grid gap-4 md:grid-cols-2">
        <OriginTable rows={s.byOrigin} />
        <Funnel f={s.funnel} />
      </div>
    </div>
  )
}
