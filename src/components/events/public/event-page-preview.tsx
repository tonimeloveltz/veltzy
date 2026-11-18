import { CalendarDays, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EventMarkdown } from '@/components/events/event-markdown'
import { FieldInputPreview } from '@/components/events/editor/form/field-input-preview'
import { eventButtonStyle, eventPageStyle } from '@/lib/events/event-theme'
import { marketingText, PRIVACY_TEXT } from '@/lib/events/consent-texts'
import { eventSummaryLine } from '@/lib/events/event-list'
import type { FieldDraft } from '@/lib/events/field-catalog'
import type { EventAppearance, EventFormat } from '@/types/events'

export interface EventPagePreviewData {
  title: string
  description: string
  format: EventFormat
  startsAt: string | null
  endsAt: string | null
  timezone: string
  city: string | null
  state: string | null
  venue: string
  organizer: string
  appearance: EventAppearance
  logoUrl: string | null
  bannerUrl: string | null
  fields: FieldDraft[]
}

interface EventPagePreviewProps {
  data: EventPagePreviewData
  mobile: boolean
}

/** Pagina do evento como o inscrito ve (so visual). O bloco (e) reaproveita a estrutura. */
export const EventPagePreview = ({ data, mobile }: EventPagePreviewProps) => {
  const a = data.appearance
  return (
    <div className={cn('overflow-hidden rounded-lg border', mobile ? 'mx-auto w-[375px] max-w-full' : 'w-full')} style={eventPageStyle(a)}>
      <div className={cn('relative bg-black/10', mobile ? 'aspect-[16/9]' : 'aspect-[3/1]')}>
        {data.bannerUrl && <img src={data.bannerUrl} alt="" className="h-full w-full object-cover object-center" />}
        {data.logoUrl && (
          <img src={data.logoUrl} alt="" className="absolute -bottom-6 left-4 h-14 w-14 rounded-lg border-2 border-white bg-white object-contain" />
        )}
      </div>
      <div className={cn('space-y-5 p-4 pt-9', !mobile && 'md:grid md:grid-cols-[1fr_320px] md:gap-6 md:space-y-0 md:p-6 md:pt-10')}>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold leading-tight">{data.title || 'Nome do evento'}</h1>
          <p className="flex items-center gap-2 text-sm opacity-80">
            <CalendarDays className="h-4 w-4 shrink-0" />
            {eventSummaryLine({ starts_at: data.startsAt, ends_at: data.endsAt, timezone: data.timezone, format: data.format, city: data.city, state: data.state })}
          </p>
          {data.venue && <p className="flex items-center gap-2 text-sm opacity-80"><MapPin className="h-4 w-4 shrink-0" />{data.venue}</p>}
          {data.description.trim() && <EventMarkdown content={data.description} />}
          <p className="text-xs opacity-70">Organizado por {data.organizer}</p>
        </div>
        <div className="space-y-3 self-start rounded-lg border bg-card p-4 text-card-foreground">
          <p className="font-semibold">Inscrição</p>
          {data.fields.map((f) => <FieldInputPreview key={f.id} field={f} />)}
          <p className="text-xs">{PRIVACY_TEXT} *</p>
          <p className="text-xs">{marketingText(data.organizer)}</p>
          <div className="rounded-md py-2.5 text-center text-sm font-semibold" style={eventButtonStyle(a)}>Quero me inscrever</div>
        </div>
      </div>
      <p className="pb-4 text-center text-xs opacity-60">Feito com Veltzy</p>
    </div>
  )
}
