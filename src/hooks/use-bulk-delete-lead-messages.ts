import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as messagesService from '@/services/messages.service'
import type { Message } from '@/types/database'

/** Exclusao em massa de conversas da inbox (versao em lote de useDeleteLeadMessages). */
export const useBulkDeleteLeadMessages = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ leadIds }: { leadIds: string[] }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      return messagesService.deleteMessagesByLeads(companyId, leadIds)
    },
    onSuccess: (deleted, { leadIds }) => {
      // O realtime de useMessages so escuta INSERT e UPDATE: sem isto, a
      // conversa aberta seguiria mostrando as mensagens apagadas.
      leadIds.forEach((id) => queryClient.setQueryData<Message[]>(['messages', id], []))
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Zero apagadas sem erro e a RLS barrando calada, nao sucesso.
      if (deleted === 0) {
        toast.error('Nenhuma mensagem foi apagada')
        return
      }
      const conversas = leadIds.length === 1 ? '1 conversa' : `${leadIds.length} conversas`
      const mensagens = deleted === 1 ? '1 mensagem apagada' : `${deleted} mensagens apagadas`
      toast.success(`${mensagens} em ${conversas}`)
    },
    onError: () => {
      toast.error('Erro ao apagar mensagens')
    },
  })
}
