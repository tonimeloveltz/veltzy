import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { checkIn, undoCheckIn } from '@/services/event-registrations.service'
import type { RegistrationRow } from '@/lib/events/registration-view'

type Vars = { id: string; undo: boolean }
type Snapshot = Array<[readonly unknown[], unknown]>

const MESSAGES: Record<string, string> = {
  invalid_state: 'Não dá para mudar a presença agora (evento cancelado ou janela de check-in encerrada).',
  not_found: 'Inscrição não encontrada.',
}

const patchRow = (r: RegistrationRow, v: Vars): RegistrationRow =>
  r.id !== v.id ? r : v.undo
    ? { ...r, status: r.confirmed_at ? 'confirmed' : 'registered', checked_in_at: null }
    : { ...r, status: 'attended', checked_in_at: new Date().toISOString() }

/** Check-in e desfazer com atualizacao otimista nas listas do evento; erro volta o estado. */
export const useCheckIn = (eventId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Vars) => {
      const r = v.undo ? await undoCheckIn(v.id) : await checkIn(v.id)
      if (r.result !== 'ok' && r.result !== 'already') throw new Error(MESSAGES[r.result] ?? 'Não foi possível registrar a presença.')
      return r
    },
    onMutate: async (v): Promise<{ snapshot: Snapshot }> => {
      await qc.cancelQueries({ queryKey: ['event-registrations-all', eventId] })
      await qc.cancelQueries({ queryKey: ['event-registrations', eventId] })
      const snapshot: Snapshot = [
        ...qc.getQueriesData({ queryKey: ['event-registrations-all', eventId] }),
        ...qc.getQueriesData({ queryKey: ['event-registrations', eventId] }),
      ]
      qc.setQueriesData<RegistrationRow[]>({ queryKey: ['event-registrations-all', eventId] }, (old) => old?.map((r) => patchRow(r, v)))
      qc.setQueriesData<{ rows: RegistrationRow[]; total: number }>({ queryKey: ['event-registrations', eventId] },
        (old) => old && { ...old, rows: old.rows.map((r) => patchRow(r, v)) })
      return { snapshot }
    },
    onError: (err: Error, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(err.message)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['event-registrations-all', eventId] })
      qc.invalidateQueries({ queryKey: ['event-registrations', eventId] })
      qc.invalidateQueries({ queryKey: ['event-counts'] })
    },
  })
}
