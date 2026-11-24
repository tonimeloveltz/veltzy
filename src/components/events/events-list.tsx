import { useMemo, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventListRow } from '@/components/events/event-list-row'
import { useEvents } from '@/hooks/events/use-events'
import { useEventCounts } from '@/hooks/events/use-event-counts'
import { groupByTab, type EventListTab } from '@/lib/events/event-list'

const TABS: Array<{ value: EventListTab; label: string; empty: string }> = [
  { value: 'upcoming', label: 'Próximos', empty: 'Nenhum evento publicado por vir.' },
  { value: 'drafts', label: 'Rascunhos', empty: 'Nenhum rascunho.' },
  { value: 'ended', label: 'Encerrados', empty: 'Nenhum evento encerrado.' },
]

interface EventsListProps {
  canCreate: boolean
  onCreate: () => void
  creating: boolean
}

export const EventsList = ({ canCreate, onCreate, creating }: EventsListProps) => {
  const { data: events, isLoading, isError } = useEvents()
  const [tab, setTab] = useState<EventListTab>('upcoming')
  const groups = useMemo(() => groupByTab(events ?? []), [events])
  const visible = groups[tab]
  const { data: counts } = useEventCounts(visible.map((e) => e.id))

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    )
  }

  if (isError) {
    return <p className="py-12 text-center text-sm text-destructive">Não foi possível carregar os eventos.</p>
  }

  if (!events?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-20 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Nenhum evento ainda</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Crie a página do evento, divulgue o link e cada inscrição vira um negócio na pipeline.
        </p>
        {canCreate && (
          <Button onClick={onCreate} disabled={creating}>
            <Plus className="mr-1.5 h-4 w-4" /> Criar evento
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as EventListTab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {groups[t.value].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {TABS.find((t) => t.value === tab)?.empty}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((ev) => <EventListRow key={ev.id} event={ev} counts={counts?.[ev.id]} />)}
        </div>
      )}
    </div>
  )
}
