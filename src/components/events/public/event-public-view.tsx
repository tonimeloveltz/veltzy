import { EventInfo } from '@/components/events/public/event-info'
import { PublicRegistrationForm } from '@/components/events/public/public-registration-form'
import { PoweredBy } from '@/components/events/public/powered-by'
import { eventButtonStyle, eventPageStyle } from '@/lib/events/event-theme'
import { eventDateLine, shortDate, STATUS_COPY } from '@/lib/events/public-event'
import type { EventPublic } from '@/types/events'

/** Pagina /e/:slug. Tema e cores do evento ficam no container; os tokens globais do app nao mudam. */
export const EventPublicView = ({ event }: { event: EventPublic }) => {
  const a = event.appearance
  const open = event.status === 'open'
  const closesAt = event.registration_closes_at
  const stateText = event.status === 'open' ? null
    : event.status === 'not_open' && event.registration_opens_at
      ? `${STATUS_COPY.not_open} ${eventDateLine(event.registration_opens_at, null, event.timezone)}`
      : STATUS_COPY[event.status]

  return (
    <div className="min-h-dvh pb-24 md:pb-0" style={eventPageStyle(a)}>
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {a.logo_url && <img src={a.logo_url} alt="" className="h-9 w-9 rounded-md bg-white object-contain" />}
        <span className="text-sm font-medium">{event.organizer.name}</span>
      </header>
      <div className="mx-auto max-w-5xl px-4">
        {a.banner_url
          ? <img src={a.banner_url} alt="" className="aspect-[3/1] w-full rounded-xl object-cover object-center" />
          : <div className="aspect-[4/1] w-full rounded-xl" style={{ backgroundColor: a.primary_color }} />}
      </div>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[minmax(0,1fr)_360px]">
        <EventInfo event={event} />
        <aside className="md:sticky md:top-4 md:self-start">
          <div className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
            <div>
              <p className="text-lg font-semibold">Inscrição gratuita</p>
              {open && closesAt && <p className="text-xs opacity-70">Inscrições até {shortDate(closesAt, event.timezone)}</p>}
              {open && event.remaining_spots !== null && <p className="text-xs opacity-70">{event.remaining_spots} vagas restantes</p>}
            </div>
            {open ? <PublicRegistrationForm event={event} /> : <p className="rounded-md bg-muted px-3 py-4 text-center font-medium">{stateText}</p>}
          </div>
        </aside>
      </main>
      <PoweredBy />
      {open && (
        <div className="fixed inset-x-0 bottom-0 flex items-center gap-3 border-t bg-card px-4 py-3 text-card-foreground md:hidden">
          <p className="min-w-0 flex-1 truncate text-xs">Gratuito{closesAt ? ` · Inscrições até ${shortDate(closesAt, event.timezone)}` : ''}</p>
          <a href="#inscricao" className="rounded-md px-4 py-2.5 text-sm font-semibold" style={eventButtonStyle(a)}>Inscrever-se</a>
        </div>
      )}
    </div>
  )
}
