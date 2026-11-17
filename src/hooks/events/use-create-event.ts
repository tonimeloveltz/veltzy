import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { createDraftEvent } from '@/services/events.service'

/** Cria o rascunho com os campos fixos e devolve o id para abrir o editor. */
export const useCreateEvent = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => createDraftEvent(companyId!, profileId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events', companyId] }),
    onError: () => toast.error('Não foi possível criar o evento.'),
  })
}
