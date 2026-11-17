import type { ReactNode } from 'react'
import { useEventsEnabled } from '@/hooks/events/use-events-enabled'
import { EventsUpgradeScreen } from '@/components/events/events-upgrade-screen'

interface EventsGateProps {
  children: ReactNode
}

export const EventsGate = ({ children }: EventsGateProps) => {
  const enabled = useEventsEnabled()
  if (!enabled) return <EventsUpgradeScreen />
  return <>{children}</>
}
