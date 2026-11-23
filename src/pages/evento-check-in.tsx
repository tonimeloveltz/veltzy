import { Link, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { EventsGate } from '@/components/events/events-gate'
import { CheckInScreen } from '@/components/events/check-in/check-in-screen'
import { useEvent } from '@/hooks/events/use-event'
import { useEventFields } from '@/hooks/events/use-event-fields'

// Tela cheia, fora do MainLayout.
const EventoCheckInContent = () => {
  const { id } = useParams<{ id: string }>()
  const event = useEvent(id)
  const fields = useEventFields(id)
  if (event.isLoading || fields.isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>
  if (!event.data || !fields.data) {
    return (
      <div className="space-y-2 p-6 py-24 text-center">
        <p className="font-medium">Evento não encontrado</p>
        <Link to="/eventos" className="text-sm text-primary underline">Voltar para Eventos</Link>
      </div>
    )
  }
  return <CheckInScreen event={event.data} fields={fields.data} />
}

const EventoCheckInPage = () => (
  <EventsGate>
    <EventoCheckInContent />
  </EventsGate>
)

export default EventoCheckInPage
