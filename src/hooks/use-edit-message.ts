import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as messagesService from '@/services/messages.service'
import type { Message } from '@/types/database'

export const useEditMessage = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      messagesService.editMessage(companyId!, messageId, content),
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(['messages', updated.lead_id], (old) =>
        (old ?? []).map((m) => (m.id === updated.id ? updated : m)),
      )
      // A previa da lista vem do ultimo texto, entao ela tambem envelhece.
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      toast.success('Mensagem editada')
    },
    onError: (err: Error) => {
      // Os erros do whatsapp-edit ja sao frases prontas em pt-BR, e sao a parte
      // util para o vendedor ("passou de 15 minutos"). Nao trocar por generico.
      toast.error(err.message || 'Erro ao editar mensagem')
    },
  })
}
