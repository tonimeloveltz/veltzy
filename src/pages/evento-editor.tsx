import { Link, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { EventsGate } from '@/components/events/events-gate'
import { EventEditor } from '@/components/events/editor/event-editor'
import { useEvent } from '@/hooks/events/use-event'
import { useEventFields } from '@/hooks/events/use-event-fields'

const EventoEditorContent = () => {
  const { id } = useParams<{ id: string }>()
  const event = useEvent(id)
  const fields = useEventFields(id)

  if (event.isLoading || fields.isLoading) {
    return <div className="space-y-4 p-4 md:p-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-96 w-full" /></div>
  }
  if (!event.data || !fields.data) {
    return (
      <div className="space-y-2 p-4 py-24 text-center md:p-6">
        <p className="font-medium">{event.isError || fields.isError ? 'Não foi possível abrir o evento' : 'Evento não encontrado'}</p>
        <Link to="/eventos" className="text-sm text-primary underline">Voltar para Eventos</Link>
      </div>
    )
  }
  return <EventEditor key={event.data.id} event={event.data} fields={fields.data} />
}

const EventoEditorPage = () => (
  <EventsGate>
    <EventoEditorContent />
  </EventsGate>
)

export default EventoEditorPage
