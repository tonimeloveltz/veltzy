import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Plus, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EditLeadModal } from '@/components/pipeline/edit-lead-modal'
import { RegistrantsToolbar } from '@/components/events/editor/registrants/registrants-toolbar'
import { RegistrantRow } from '@/components/events/editor/registrants/registrant-row'
import { AddRegistrantDialog } from '@/components/events/editor/registrants/add-registrant-dialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useLeadDetail } from '@/hooks/use-lead-detail'
import { useEventRegistrations } from '@/hooks/events/use-event-registrations'
import { useAllEventRegistrations } from '@/hooks/events/use-all-event-registrations'
import { useCheckIn } from '@/hooks/events/use-check-in'
import { useRegistrationAction } from '@/hooks/events/use-registration-action'
import { PAGE_SIZE, type StatusFilter } from '@/services/event-registrations.service'
import { checkInOpen } from '@/lib/events/registration-view'
import { downloadCsv, registrationsToCsv } from '@/lib/events/csv-export'
import { toFieldSpec } from '@/lib/events/registration-form'
import type { Event, EventFormField } from '@/types/events'

interface RegistrantsTabProps {
  event: Event
  fields: EventFormField[]
  isManager: boolean
}

const HEAD = ['Inscrito', 'WhatsApp', 'Empresa', 'Origem', 'Status', 'Check-in', '']

export const RegistrantsTab = ({ event, fields, isManager }: RegistrantsTabProps) => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [origin, setOrigin] = useState('all')
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [openDeal, setOpenDeal] = useState<{ leadId: string; dealId: string } | null>(null)
  const debounced = useDebouncedValue(search, 300)
  const list = useEventRegistrations(event.id, { search: debounced, status, origin, page })
  const all = useAllEventRegistrations(event.id)
  const checkIn = useCheckIn(event.id)
  const action = useRegistrationAction(event.id)
  const lead = useLeadDetail(openDeal?.leadId)
  const companyFieldId = fields.find((f) => f.key === 'company')?.id ?? null
  const canCheckIn = event.status !== 'canceled' && checkInOpen(event.ends_at)

  const rows = useMemo(() => all.data ?? [], [all.data])
  const active = rows.filter((r) => r.status !== 'canceled')
  const origins = useMemo(() => {
    const refs = [...new Set(rows.map((r) => r.ref_code).filter((v): v is string => !!v))].map((v) => ({ value: `ref:${v}`, label: `ref: ${v}` }))
    const utms = [...new Set(rows.filter((r) => !r.ref_code).map((r) => r.utm_source).filter((v): v is string => !!v))]
      .map((v) => ({ value: `utm:${v}`, label: `utm: ${v}` }))
    return [...refs, ...utms]
  }, [rows])
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0) }

  const exportCsv = () => downloadCsv(
    registrationsToCsv(rows, { timeZone: event.timezone, fieldOrder: fields.map((f) => f.id) }), `inscritos-${event.slug}.csv`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm"><b>{active.length}</b> inscritos · <b>{active.filter((r) => r.confirmed_at).length}</b> confirmados · <b>{active.filter((r) => r.status === 'attended').length}</b> presentes</p>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {isManager && <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Adicionar inscrito</Button>}
          <Button type="button" variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}><Download className="h-4 w-4" /> Exportar CSV</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/eventos/${event.id}/check-in`)}><ScanLine className="h-4 w-4" /> Modo check-in</Button>
        </div>
      </div>
      <RegistrantsToolbar search={search} status={status} origin={origin} origins={origins}
        onSearch={resetPage(setSearch)} onStatus={resetPage(setStatus)} onOrigin={resetPage(setOrigin)} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>{HEAD.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.data?.rows.map((r) => (
              <RegistrantRow key={r.id} row={r} timeZone={event.timezone} companyFieldId={companyFieldId} isManager={isManager}
                canCheckIn={canCheckIn} onCheckIn={(undo) => checkIn.mutate({ id: r.id, undo })}
                onAction={(a) => action.mutate({ id: r.id, action: a })}
                onOpenDeal={() => r.lead_id && r.deal_id && setOpenDeal({ leadId: r.lead_id, dealId: r.deal_id })} />
            ))}
          </tbody>
        </table>
        {list.isLoading && <div className="space-y-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>}
        {list.data && list.data.rows.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">{debounced || status !== 'active' || origin !== 'all' ? 'Nenhum inscrito com esses filtros.' : 'Ainda não há inscritos.'}</p>
        )}
      </div>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Página {page + 1} de {pages} · {total} inscrições</span>
          <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
      <AddRegistrantDialog eventId={event.id} fields={fields.map(toFieldSpec)} open={adding} onOpenChange={setAdding} />
      <EditLeadModal lead={openDeal ? lead.data ?? null : null} open={!!openDeal && !!lead.data} dealId={openDeal?.dealId ?? null}
        onClose={() => setOpenDeal(null)} />
    </div>
  )
}
