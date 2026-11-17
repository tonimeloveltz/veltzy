import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { EventsGate } from '@/components/events/events-gate'
import { useEvent } from '@/hooks/events/use-event'

// Tela cheia, fora do MainLayout. O modo check-in entra no bloco (d).
const EventoCheckInContent = () => {
  const { id } = useParams<{ id: string }>()
  const { data: event } = useEvent(id)
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 bg-foreground px-4 py-3 text-background">
        <Link to={id ? `/eventos/${id}` : '/eventos'} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
        <span className="truncate font-medium">{event?.title ?? 'Check-in'}</span>
      </header>
      <p className="p-6 text-center text-sm text-muted-foreground">O modo check-in está em construção.</p>
    </div>
  )
}

const EventoCheckInPage = () => (
  <EventsGate>
    <EventoCheckInContent />
  </EventsGate>
)

export default EventoCheckInPage
