import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { toast } from 'sonner'
import {
  listInstances,
  listWahaInstances,
  getInstanceStatus,
  createInstance,
  fetchQrCode,
  disconnectInstance,
  reconnectInstance,
  deleteInstance,
} from '@/services/whatsapp-instances.service'

export function useWhatsAppInstances() {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['whatsapp-instances', companyId],
    queryFn: () => listInstances(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  })
}

export function useWahaInstances() {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['waha-instances', companyId],
    queryFn: () => listWahaInstances(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  })
}

export function useInstanceStatus(instanceName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['instance-status', instanceName],
    queryFn: () => getInstanceStatus(instanceName!),
    enabled: !!instanceName && enabled,
    refetchInterval: 3_000,
  })
}

export function useCreateInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (displayName?: string) => createInstance(displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDisconnectInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceName: string) => disconnectInstance(instanceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] })
      toast.success('Instancia desconectada')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useReconnectInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceName: string) => reconnectInstance(instanceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (instanceName: string) => deleteInstance(instanceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] })
      toast.success('Instancia deletada')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useRefreshQr() {
  return useMutation({
    mutationFn: (instanceName: string) => fetchQrCode(instanceName),
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
