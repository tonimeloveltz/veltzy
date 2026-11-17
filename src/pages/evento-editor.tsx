import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EventsGate } from '@/components/events/events-gate'
import { EventStatusBadge } from '@/components/events/event-status-badge'
import { useEvent } from '@/hooks/events/use-event'

// Bloco (c), parte 1: so o cabecalho. As abas 1 a 4 entram na parte 2 (c2) e 3 (c3).
const EventoEditorContent = () => {
  const { id } = useParams<{ id: string }>()
  const { data: event, isLoading } = useEvent(id)

  if (isLoading) return <div className="p-4 md:p-6"><Skeleton className="h-24 w-full" /></div>
  if (!event) {
    return (
      <div className="space-y-2 p-4 py-24 text-center md:p-6">
        <p className="font-medium">Evento não encontrado</p>
        <Link to="/eventos" className="text-sm text-primary underline">Voltar para Eventos</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/eventos" className="hover:text-foreground">Eventos</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="truncate text-foreground">{event.title}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{event.title}</h1>
        <EventStatusBadge status={event.status} closedReason={event.closed_reason} />
      </div>
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        O editor do evento está em construção.
      </p>
    </div>
  )
}

const EventoEditorPage = () => (
  <EventsGate>
    <EventoEditorContent />
  </EventsGate>
)

export default EventoEditorPage
