import { useMutation, useQueryClient } from '@tanstack/react-query'
import { registerManually, type ManualRegistrationInput } from '@/services/event-registrations.service'

/** Inscricao manual; o resultado (ok, validation, duplicate...) volta para o dialogo decidir. */
export const useRegisterManually = (eventId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<ManualRegistrationInput, 'event_id'>) => registerManually({ ...input, event_id: eventId }),
    onSuccess: (r) => {
      if (r.result !== 'ok') return
      qc.invalidateQueries({ queryKey: ['event-registrations', eventId] })
      qc.invalidateQueries({ queryKey: ['event-registrations-all', eventId] })
      qc.invalidateQueries({ queryKey: ['event-counts'] })
    },
  })
}
