import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Monitor, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppearanceControls } from '@/components/events/editor/appearance/appearance-controls'
import { EventPagePreview } from '@/components/events/public/event-page-preview'
import { eventAssetUrl } from '@/services/event-assets.service'
import { formatEventLocation } from '@/lib/events/render-message'
import { fromZonedInput } from '@/lib/events/zoned-time'
import type { EditorValues } from '@/lib/events/editor-form'

interface AppearanceTabProps {
  eventId: string
  timezone: string
  companyName: string
}

/** Aba 3: controles a esquerda, preview ao vivo (Desktop/Mobile) a direita. */
export const AppearanceTab = ({ eventId, timezone, companyName }: AppearanceTabProps) => {
  const { control } = useFormContext<EditorValues>()
  const v = useWatch({ control }) as EditorValues
  const [mobile, setMobile] = useState(false)

  const venue = v.format === 'online' ? '' : formatEventLocation({
    format: v.format, venue_name: v.venue_name || null, street: v.street || null, number: v.number || null,
    district: v.district || null, city: v.city || null, state: v.state || null,
  })

  return (
    <div className="grid gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
      <AppearanceControls eventId={eventId} />
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Prévia da página</p>
          <div className="flex rounded-md bg-muted p-0.5">
            {([false, true] as const).map((m) => (
              <button key={String(m)} type="button" onClick={() => setMobile(m)} aria-pressed={mobile === m}
                className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs', mobile === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                {m ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />} {m ? 'Mobile' : 'Desktop'}
              </button>
            ))}
          </div>
        </div>
        <EventPagePreview mobile={mobile} data={{
          title: v.title, description: v.description, format: v.format,
          startsAt: fromZonedInput(v.starts_at, timezone), endsAt: fromZonedInput(v.ends_at, timezone), timezone,
          city: v.city || null, state: v.state || null, venue,
          organizer: v.organizer_name.trim() || companyName,
          appearance: v.appearance,
          logoUrl: eventAssetUrl(v.appearance.logo_path), bannerUrl: eventAssetUrl(v.appearance.banner_path),
          fields: v.fields,
        }} />
      </div>
    </div>
  )
}
