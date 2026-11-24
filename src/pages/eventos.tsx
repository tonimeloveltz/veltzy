import { useNavigate } from 'react-router-dom'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventsGate } from '@/components/events/events-gate'
import { EventsList } from '@/components/events/events-list'
import { useRoles } from '@/hooks/use-roles'
import { useCreateEvent } from '@/hooks/events/use-create-event'

const EventosContent = () => {
  const navigate = useNavigate()
  const { isManager } = useRoles()
  const create = useCreateEvent()
  const onCreate = () => create.mutate(undefined, { onSuccess: (id) => navigate(`/eventos/${id}`) })

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Eventos</h1>
            <p className="text-sm text-muted-foreground">Página de inscrição que vira negócio na pipeline</p>
          </div>
        </div>
        {isManager && (
          <Button onClick={onCreate} disabled={create.isPending}>
            <Plus className="mr-1.5 h-4 w-4" /> Criar evento
          </Button>
        )}
      </div>
      <EventsList canCreate={isManager} onCreate={onCreate} creating={create.isPending} />
    </div>
  )
}

const EventosPage = () => (
  <EventsGate>
    <EventosContent />
  </EventsGate>
)

export default EventosPage
