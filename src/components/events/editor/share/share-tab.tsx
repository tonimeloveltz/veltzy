import { LinkQrCard } from '@/components/events/editor/share/link-qr-card'
import { WhatsappTextCard } from '@/components/events/editor/share/whatsapp-text-card'
import { RefCodesCard } from '@/components/events/editor/share/ref-codes-card'
import { UtmBuilderCard } from '@/components/events/editor/share/utm-builder-card'
import { useAllEventRegistrations } from '@/hooks/events/use-all-event-registrations'
import { eventPublicUrl } from '@/lib/events/event-list'
import { formatEventLocation } from '@/lib/events/render-message'
import { whatsappShareText } from '@/lib/events/share-text'
import type { Event } from '@/types/events'

interface ShareTabProps {
  event: Event
  canEdit: boolean
}

/** Aba 5: usa o evento SALVO (o link e o texto valem para o que esta no ar). */
export const ShareTab = ({ event, canEdit }: ShareTabProps) => {
  const url = eventPublicUrl(event.slug)
  const { data: registrations = [] } = useAllEventRegistrations(event.id)
  const text = whatsappShareText({
    title: event.title, startsAt: event.starts_at, timeZone: event.timezone, location: formatEventLocation(event),
    hasCapacity: event.capacity !== null, url,
  })

  return (
    <div className="space-y-4">
      {event.status === 'draft' && (
        <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          O evento ainda é rascunho: os links só abrem depois de publicar.
        </p>
      )}
      <LinkQrCard url={url} slug={event.slug} />
      <WhatsappTextCard text={text} />
      <RefCodesCard eventId={event.id} url={url} registrations={registrations} canEdit={canEdit} />
      <UtmBuilderCard url={url} />
    </div>
  )
}
