import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { EventPublicView } from '@/components/events/public/event-public-view'
import { EventNotFound } from '@/components/events/public/event-not-found'
import { usePublicEvent } from '@/hooks/events/public/use-public-event'

// Publica: sem ProtectedRoute, sem layout do app, so pela event-public.
const EventoPublicoPage = () => {
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading, isError } = usePublicEvent(slug)
  useEffect(() => { if (data) document.title = data.title }, [data])
  if (isLoading) return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (isError || !data) return <EventNotFound />
  return <EventPublicView event={data} />
}

export default EventoPublicoPage
