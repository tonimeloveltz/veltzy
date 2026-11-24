import { useMutation, useQueryClient } from '@tanstack/react-query'
import { registrationAction } from '@/services/event-public.service'

/** Confirmar presenca ou cancelar a inscricao pelo token (pagina da inscricao). */
export const usePublicRegistrationAction = (token: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (action: 'confirm' | 'cancel') => registrationAction(token, action),
    onSettled: () => qc.invalidateQueries({ queryKey: ['public-registration', token] }),
  })
}
