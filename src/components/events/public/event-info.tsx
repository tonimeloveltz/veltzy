import { CalendarDays, ExternalLink, MapPin, MonitorPlay } from 'lucide-react'
import { EventMarkdown } from '@/components/events/event-markdown'
import { FORMAT_LABEL } from '@/lib/events/event-list'
import { eventDateLine, mapsSearchUrl } from '@/lib/events/public-event'
import { formatEventLocation } from '@/lib/events/render-message'
import type { EventPublic } from '@/types/events'

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2 rounded-lg border bg-card p-4 text-card-foreground">
    <h2 className="font-semibold">{title}</h2>
    {children}
  </section>
)

/** Coluna de informacoes da pagina publica. */
export const EventInfo = ({ event }: { event: EventPublic }) => {
  const v = event.venue
  const address = v ? formatEventLocation({ format: event.format, venue_name: v.name, street: v.street, number: v.number,
    district: v.district, city: v.city, state: v.state }) : ''
  const cityLine = v ? [v.city, v.state].filter(Boolean).join(', ') : ''
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium opacity-80">
          <CalendarDays className="h-4 w-4 shrink-0" /> {eventDateLine(event.starts_at, event.ends_at, event.timezone)}
        </p>
        <h1 className="text-3xl font-bold leading-tight">{event.title}</h1>
        <p className="flex items-center gap-2 text-sm opacity-80">
          <MapPin className="h-4 w-4 shrink-0" /> {[v?.name, cityLine, FORMAT_LABEL[event.format]].filter(Boolean).join(' · ')}
        </p>
      </div>
      {event.description?.trim() && <Box title="Sobre o evento"><EventMarkdown content={event.description} /></Box>}
      {event.format !== 'online' && v && (
        <Box title="Local">
          <p className="text-sm">{address}</p>
          <a href={mapsSearchUrl(address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline">
            Abrir no Google Maps <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Box>
      )}
      {event.format !== 'presencial' && (
        <Box title="Online">
          <p className="flex items-center gap-2 text-sm"><MonitorPlay className="h-4 w-4" /> O link da transmissão é enviado depois da inscrição.</p>
        </Box>
      )}
      <Box title="Organizador">
        <p className="text-sm font-medium">{event.organizer.name}</p>
        {event.organizer.description && <p className="whitespace-pre-line text-sm opacity-80">{event.organizer.description}</p>}
        {event.organizer.contact && <p className="text-sm opacity-80">{event.organizer.contact}</p>}
      </Box>
    </div>
  )
}
