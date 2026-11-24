import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CalendarButtons } from '@/components/events/public/calendar-buttons'
import { PoweredBy } from '@/components/events/public/powered-by'
import { usePublicRegistrationAction } from '@/hooks/events/public/use-public-registration-action'
import { eventButtonStyle, eventPageStyle } from '@/lib/events/event-theme'
import { eventDateLine } from '@/lib/events/public-event'
import { formatEventLocation } from '@/lib/events/render-message'
import type { RegistrationPublic } from '@/types/events'

const WITHIN_48H = (startsAt: string | null) => !!startsAt && Date.parse(startsAt) - Date.now() < 48 * 3600 * 1000

export const RegistrationPublicView = ({ reg, token }: { reg: RegistrationPublic; token: string }) => {
  const ev = reg.event
  const [params] = useSearchParams()
  const action = usePublicRegistrationAction(token)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const auto = useRef(false)
  // Link do lembrete (?confirmar=1): confirma sozinho ao abrir.
  useEffect(() => {
    if (!auto.current && params.get('confirmar') === '1' && reg.can_confirm) { auto.current = true; action.mutate('confirm') }
  }, [params, reg.can_confirm, action])

  const v = ev.venue
  const location = v ? formatEventLocation({ format: ev.format, venue_name: v.name, street: v.street, number: v.number,
    district: v.district, city: v.city, state: v.state }) : 'Online'
  const canceled = reg.status === 'canceled'
  const title = canceled ? 'Inscrição cancelada' : reg.status === 'confirmed' || reg.status === 'attended' ? 'Presença confirmada' : 'Inscrição confirmada'

  return (
    <div className="min-h-dvh" style={eventPageStyle(ev.appearance)}>
      <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
        <div className="space-y-2 text-center">
          {!canceled && <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: ev.appearance.primary_color }} />}
          <h1 className="text-2xl font-bold">{title}</h1>
          {!canceled && <p>{reg.first_name}, guarde este link: aqui ficam os detalhes da sua inscrição.</p>}
        </div>
        <section className="space-y-2 rounded-xl border bg-card p-5 text-card-foreground">
          <p className="text-lg font-semibold">{ev.title}</p>
          <p className="text-sm">{eventDateLine(ev.starts_at, ev.ends_at, ev.timezone)}</p>
          <p className="text-sm">{location}</p>
          {ev.online_url && !canceled && (
            <p className="text-sm">Transmissão: <a href={ev.online_url} target="_blank" rel="noopener noreferrer" className="underline">{ev.online_url}</a></p>
          )}
          {ev.confirmation_page_message && <p className="whitespace-pre-line border-t pt-3 text-sm">{ev.confirmation_page_message}</p>}
          <p className="text-xs opacity-70">Organizado por {ev.organizer_name}</p>
        </section>
        {!canceled && ev.starts_at && ev.ends_at && (
          <CalendarButtons filename={`${ev.slug}.ics`} ev={{ uid: token, title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
            location, details: `${window.location.origin}/e/${ev.slug}/i/${token}` }} />
        )}
        {action.data === 'ok' && <p role="status" className="rounded-md border px-3 py-2 text-sm">Pronto, tudo certo.</p>}
        <div className="flex flex-wrap gap-2">
          {reg.can_confirm && WITHIN_48H(ev.starts_at) && (
            <button type="button" disabled={action.isPending} onClick={() => action.mutate('confirm')} style={eventButtonStyle(ev.appearance)}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar presença
            </button>
          )}
          {reg.can_cancel && (
            <button type="button" onClick={() => setConfirmCancel(true)} className="rounded-md px-4 py-2.5 text-sm underline">Cancelar minha inscrição</button>
          )}
        </div>
      </main>
      <PoweredBy />
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar sua inscrição?</AlertDialogTitle>
            <AlertDialogDescription>A vaga fica livre para outra pessoa. Para voltar, será preciso se inscrever de novo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter inscrição</AlertDialogCancel>
            <AlertDialogAction onClick={() => action.mutate('cancel')}>Cancelar inscrição</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
