import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { lifecycleErrorMessage, publishEvent, unpublishEvent } from '@/services/events.service'
import { checklistLabel } from '@/lib/events/publish-checklist'

export type PublishAction = 'publish' | 'unpublish'

/** Publicar valida de novo no banco (event_publish_missing); Despublicar volta para rascunho. */
export const usePublishEvent = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: PublishAction }) => {
      const r = action === 'publish' ? await publishEvent(id) : await unpublishEvent(id)
      if (r.result === 'missing') {
        throw new Error(`Falta para publicar: ${r.missing.map(checklistLabel).join(', ')}.`)
      }
      if (r.result !== 'ok') throw new Error(lifecycleErrorMessage(r))
      return { id, action }
    },
    onSuccess: ({ id, action }) => {
      qc.invalidateQueries({ queryKey: ['event', id] })
      qc.invalidateQueries({ queryKey: ['events', companyId] })
      toast.success(action === 'publish' ? 'Evento publicado.' : 'Evento voltou para rascunho.')
    },
    onError: (err: Error) => toast.error(err.message || 'Não foi possível concluir a ação.'),
  })
}
