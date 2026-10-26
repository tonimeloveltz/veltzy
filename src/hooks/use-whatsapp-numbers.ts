import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import {
  listWhatsAppNumbers,
  disconnectNumber,
  disconnectCloudApiNumber,
  deleteNumber,
  createWahaSession,
  getWahaSession,
  type WhatsAppProviderKind,
} from '@/services/whatsapp-numbers.service'

interface UseWhatsAppNumbersOptions {
  enabled?: boolean
  refetchInterval?: number
}

export function useWhatsAppNumbers({ enabled = true, refetchInterval }: UseWhatsAppNumbersOptions = {}) {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['whatsapp-numbers', companyId],
    queryFn: listWhatsAppNumbers,
    enabled: !!companyId && enabled,
    staleTime: 30_000,
    refetchInterval,
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
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ provider, ref }: { provider: WhatsAppProviderKind; ref: string }) =>
      provider === 'cloud_api'
        ? disconnectCloudApiNumber(companyId!, ref)
        : disconnectNumber(provider, ref),
    onSuccess: (_data, { provider }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
      if (provider === 'cloud_api') {
        queryClient.invalidateQueries({ queryKey: ['cloud-api-numbers'] })
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] })
      }
      toast.success('Numero desconectado')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ provider, ref }: { provider: WhatsAppProviderKind; ref: string }) =>
      deleteNumber(provider, ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
      toast.success('Numero removido')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
