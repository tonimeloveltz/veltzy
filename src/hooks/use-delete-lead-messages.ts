import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as messagesService from '@/services/messages.service'
import type { Message } from '@/types/database'

export const useDeleteLeadMessages = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ leadId }: { leadId: string }) =>
      messagesService.deleteLeadMessages(companyId!, leadId),
    onSuccess: (deleted, { leadId }) => {
      // O realtime de useMessages so escuta INSERT e UPDATE: sem isto, a
      // conversa aberta seguiria mostrando as mensagens apagadas.
      queryClient.setQueryData<Message[]>(['messages', leadId], [])
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Zero apagadas sem erro e a RLS barrando calada, nao sucesso.
      if (deleted === 0) {
        toast.error('Nenhuma mensagem foi apagada')
        return
      }
      toast.success(deleted === 1 ? '1 mensagem apagada' : `${deleted} mensagens apagadas`)
    },
    onError: () => {
      toast.error('Erro ao apagar mensagens')
    },
  })
}
