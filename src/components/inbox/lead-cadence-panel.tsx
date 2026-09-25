import { useState } from 'react'
import { History, ChevronDown, ChevronUp, Plus, Trash2, Loader2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useLeadCadence, useCreateContactEvent, useDeleteContactEvent } from '@/hooks/use-lead-cadence'
import { buildCadenceTimeline, lastContactLabel, SP_TZ } from '@/lib/contact-cadence'
import type { CadenceTimelineEntry } from '@/lib/contact-cadence'

/**
 * A data exibida sai do `dayKey` (ja em SP), nao de um toLocaleDateString sobre
 * o instante: o dia mostrado e o selo D+N tem que ser o MESMO dia. Formatando o
 * instante no fuso do browser, uma maquina configurada em outro fuso mostraria
 * "05/10" ao lado de um selo calculado para 06/10.
 */
const formatDayKey = (dayKey: string): string => {
  const [year, month, day] = dayKey.split('-')
  return `${day}/${month}/${year}`
}

/** Hora em SP, para distinguir dois contatos registrados no mesmo dia. */
const formatTime = (isoDate: string): string =>
  new Date(isoDate).toLocaleTimeString('pt-BR', {
    timeZone: SP_TZ,
    hour: '2-digit',
    minute: '2-digit',
  })

interface LeadCadencePanelProps {
  leadId: string
}

const LeadCadencePanel = ({ leadId }: LeadCadencePanelProps) => {
  const { data: events, isLoading } = useLeadCadence(leadId)
  const createContactEvent = useCreateContactEvent()
  const deleteContactEvent = useDeleteContactEvent()
  const [expanded, setExpanded] = useState(true)
  const [confirmRemove, setConfirmRemove] = useState<CadenceTimelineEntry | null>(null)

  const timeline = buildCadenceTimeline(events ?? [])
  const summary = lastContactLabel(events ?? [])

  return (
    <>
      <div className="border-b px-4 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-smooth"
        >
          <span className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            {/* Sem o contador enquanto carrega: "(0)" piscando antes do numero
                real seria uma informacao errada na tela, ainda que por um
                instante. */}
            {isLoading ? 'Cadência' : `Cadência (${timeline.length})`}
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {isLoading ? (
              <div className="flex h-12 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {summary && (
                  <p className="text-[11px] text-muted-foreground">{summary}</p>
                )}

                {timeline.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/60 py-1">
                    Nenhum contato registrado
                  </p>
                )}

                {timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent hover:text-accent-foreground transition-smooth group"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                    <p className="flex-1 min-w-0 truncate text-xs">
                      {formatDayKey(entry.dayKey)}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {formatTime(entry.contactedAt)}
                      </span>
                    </p>
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                      D+{entry.dPlus}
                    </span>
                    <button
                      onClick={() => setConfirmRemove(entry)}
                      disabled={deleteContactEvent.isPending}
                      title="Remover contato"
                      className="rounded p-0.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs mt-1"
                  onClick={() => createContactEvent.mutate({ leadId })}
                  disabled={createContactEvent.isPending}
                >
                  {createContactEvent.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Registrar contato
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este contato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contato de {confirmRemove ? formatDayKey(confirmRemove.dayKey) : ''} sai da linha
              do tempo. Se for o primeiro contato do lead, os selos D+N dos demais são
              recalculados a partir do novo primeiro. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                // DELETE, nunca UPDATE: a tabela nao tem policy nem GRANT de
                // UPDATE, e um update passaria afetando zero linhas sem erro.
                if (confirmRemove) deleteContactEvent.mutate({ eventId: confirmRemove.id, leadId })
                setConfirmRemove(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export { LeadCadencePanel }
