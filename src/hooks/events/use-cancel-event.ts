import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { cancelEvent, lifecycleErrorMessage } from '@/services/events.service'

export const useCancelEvent = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await cancelEvent(id)
      if (r.result !== 'ok') throw new Error(lifecycleErrorMessage(r))
      return id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['events', companyId] })
      qc.invalidateQueries({ queryKey: ['event', id] })
      toast.success('Evento cancelado.')
    },
    onError: (err: Error) => toast.error(err.message || 'Não foi possível cancelar o evento.'),
  })
}
