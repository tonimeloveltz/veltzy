import { BasicsSection } from '@/components/events/editor/overview/basics-section'
import { LocationSection } from '@/components/events/editor/overview/location-section'
import { ScheduleSection } from '@/components/events/editor/overview/schedule-section'
import { OrganizerSection } from '@/components/events/editor/overview/organizer-section'
import type { Event } from '@/types/events'

interface OverviewTabProps {
  event: Event
  companyName: string
}

export const OverviewTab = ({ event, companyName }: OverviewTabProps) => (
  <div className="space-y-4">
    <BasicsSection event={event} />
    <LocationSection />
    <ScheduleSection timezone={event.timezone} />
    <OrganizerSection companyName={companyName} />
  </div>
)
