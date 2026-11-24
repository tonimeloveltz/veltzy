import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { duplicateEvent, lifecycleErrorMessage } from '@/services/events.service'

/** Duplica como rascunho (campos, responsaveis e codigos de divulgador vao junto). Devolve o id novo. */
export const useDuplicateEvent = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await duplicateEvent(id)
      if (r.result !== 'ok' || !r.event_id) throw new Error(lifecycleErrorMessage(r))
      return r.event_id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', companyId] })
      toast.success('Evento duplicado como rascunho.')
    },
    onError: (err: Error) => toast.error(err.message || 'Não foi possível duplicar o evento.'),
  })
}
