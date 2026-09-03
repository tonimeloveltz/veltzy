import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import {
  listWhatsAppNumbers,
  disconnectNumber,
  createWahaSession,
  getWahaSession,
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

export function useCreateWahaSession() {
  return useMutation({
    mutationFn: (displayName?: string) => createWahaSession(displayName),
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/** Polling do status da sessao WAHA durante a conexao (a cada 3s enquanto habilitado). */
export function useWahaSessionStatus(sessionName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['waha-session-status', sessionName],
    queryFn: () => getWahaSession(sessionName!),
    enabled: !!sessionName && enabled,
    refetchInterval: 3_000,
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
