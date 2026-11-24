import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { createEventPipeline, lifecycleErrorMessage } from '@/services/events.service'

/** Cria "Evento: <titulo>" com 4 etapas e ja mapeia no evento (o banco grava direto no evento). */
export const useCreateEventPipeline = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await createEventPipeline(id)
      if (r.result !== 'ok') throw new Error(lifecycleErrorMessage(r))
      return id
    },
    onSuccess: async (id) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['pipelines', companyId] }),
        qc.invalidateQueries({ queryKey: ['pipeline-stages', companyId] }),
        qc.invalidateQueries({ queryKey: ['event', id] }),
      ])
      toast.success('Pipeline criado e ligado ao evento.')
    },
    onError: (err: Error) => toast.error(err.message || 'Não foi possível criar o pipeline.'),
  })
}
