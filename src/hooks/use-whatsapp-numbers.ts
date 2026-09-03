import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import {
  listWhatsAppNumbers,
  disconnectNumber,
  type WhatsAppProviderKind,
} from '@/services/whatsapp-numbers.service'

export function useWhatsAppNumbers() {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['whatsapp-numbers', companyId],
    queryFn: listWhatsAppNumbers,
    enabled: !!companyId,
    staleTime: 30_000,
  })
}

export function useDisconnectNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ provider, ref }: { provider: WhatsAppProviderKind; ref: string }) =>
      disconnectNumber(provider, ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
      toast.success('Numero desconectado')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
