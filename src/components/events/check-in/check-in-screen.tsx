import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { CheckInCard } from '@/components/events/check-in/check-in-card'
import { AddRegistrantDialog } from '@/components/events/editor/registrants/add-registrant-dialog'
import { useAllEventRegistrations } from '@/hooks/events/use-all-event-registrations'
import { useCheckIn } from '@/hooks/events/use-check-in'
import { useRoles } from '@/hooks/use-roles'
import { checkInOpen, fullName, type RegistrationRow } from '@/lib/events/registration-view'
import { toFieldSpec } from '@/lib/events/registration-form'
import type { Event, EventFormField } from '@/types/events'

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const matches = (r: RegistrationRow, q: string) => {
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  return normalize(`${fullName(r)} ${r.email ?? ''}`).includes(normalize(q)) || (digits.length >= 3 && r.whatsapp.includes(digits))
}

/** Modo check-in: tela cheia, mobile-first, refetch a cada 15 s (sem Realtime na Fase 1). */
export const CheckInScreen = ({ event, fields }: { event: Event; fields: EventFormField[] }) => {
  const { isManager } = useRoles()
  const { data, isLoading } = useAllEventRegistrations(event.id, 15_000)
  const checkIn = useCheckIn(event.id)
  const [q, setQ] = useState('')
  const [undoId, setUndoId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const open = event.status !== 'canceled' && checkInOpen(event.ends_at)
  const companyFieldId = fields.find((f) => f.key === 'company')?.id ?? null

  const active = useMemo(() => (data ?? []).filter((r) => r.status !== 'canceled')
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'pt-BR')), [data])
  const present = active.filter((r) => r.status === 'attended').length
  const shown = active.filter((r) => matches(r, q.trim()))
  const undoRow = active.find((r) => r.id === undoId)

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 space-y-2 bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center gap-3">
          <Link to={`/eventos/${event.id}`} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
          {isManager && open && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Adicionar</Button>
          )}
        </div>
        <p className="text-sm">{present} de {active.length} presentes</p>
        <Progress value={active.length ? (present / active.length) * 100 : 0} className="h-1.5 bg-primary-foreground/25" />
      </header>
      <main className="mx-auto max-w-2xl space-y-3 p-4">
        {!open && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {event.status === 'canceled' ? 'Evento cancelado: check-in desligado.' : 'O check-in fecha 48 horas depois do fim do evento.'}
          </p>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, WhatsApp ou e-mail"
            className="h-12 pl-10 text-base" aria-label="Buscar inscrito" />
        </div>
        {isLoading ? <Skeleton className="h-40 w-full" /> : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <CheckInCard key={r.id} row={r} companyFieldId={companyFieldId} timeZone={event.timezone} disabled={!open}
                onCheckIn={() => checkIn.mutate({ id: r.id, undo: false })} onAskUndo={() => setUndoId(r.id)} />
            ))}
            {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{q ? 'Ninguém encontrado.' : 'Ainda não há inscritos.'}</p>}
          </ul>
        )}
      </main>
      <AlertDialog open={!!undoRow} onOpenChange={(o) => !o && setUndoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Desfazer check-in de {undoRow ? fullName(undoRow) : ''}?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (undoRow) checkIn.mutate({ id: undoRow.id, undo: true }); setUndoId(null) }}>Desfazer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AddRegistrantDialog eventId={event.id} fields={fields.map(toFieldSpec)} open={adding} onOpenChange={setAdding} />
    </div>
  )
}
