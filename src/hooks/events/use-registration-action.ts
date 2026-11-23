import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminResendConfirmation, adminSetRegistrationStatus } from '@/services/event-registrations.service'

export type RegistrationAction = 'confirm' | 'cancel' | 'resend'

const OK: Record<RegistrationAction, string> = {
  confirm: 'Presença confirmada.',
  cancel: 'Inscrição cancelada. A vaga foi liberada.',
  resend: 'Confirmação reenviada.',
}

/** Itens do menu da aba Inscritos (so admin/gestor; o banco confere o papel). */
export const useRegistrationAction = (eventId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: RegistrationAction }) => {
      const r = action === 'resend' ? await adminResendConfirmation(id) : await adminSetRegistrationStatus(id, action)
      if (r.result === 'rate_limited') throw new Error('Já reenviado na última hora.')
      if (r.result === 'already') return action
      if (r.result === 'forbidden') throw new Error('Você não tem permissão para esta ação.')
      if (r.result !== 'ok') throw new Error('A inscrição mudou de estado. Atualize a lista.')
      return action
    },
    onSuccess: (action) => {
      toast.success(OK[action])
      qc.invalidateQueries({ queryKey: ['event-registrations', eventId] })
      qc.invalidateQueries({ queryKey: ['event-registrations-all', eventId] })
      qc.invalidateQueries({ queryKey: ['event-counts'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
