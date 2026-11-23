import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { RegistrationPublicView } from '@/components/events/public/registration-public-view'
import { EventNotFound } from '@/components/events/public/event-not-found'
import { usePublicRegistration } from '@/hooks/events/public/use-public-registration'

// Pagina privada da inscricao (link com token). Fora do Open Graph do evento.
const EventoInscricaoPage = () => {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = usePublicRegistration(token)
  useEffect(() => { if (data) document.title = `Inscrição: ${data.event.title}` }, [data])
  if (isLoading) return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (isError || !data || !token) return <EventNotFound what="Inscrição não encontrada" />
  return <RegistrationPublicView reg={data} token={token} />
}

export default EventoInscricaoPage
