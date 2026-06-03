import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as service from '@/services/source-integrations.service'
import type { WebhookPreset } from '@/types/database'

export const useWebhookIntegrations = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['webhook-integrations', companyId],
    queryFn: () => service.getWebhookIntegrations(companyId!),
    enabled: !!companyId,
  })
}

export const useCreateWebhookIntegration = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: (input: { sourceId: string; pipelineId: string; preset: WebhookPreset }) =>
      service.createWebhookIntegration(companyId!, input.sourceId, input.pipelineId, input.preset),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-integrations'] })
      toast.success('Webhook criado com sucesso')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao criar webhook'),
  })
}

export const useRegenerateWebhookToken = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: (integrationId: string) =>
      service.regenerateWebhookToken(companyId!, integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-integrations'] })
      toast.success('Token regenerado')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao regenerar token'),
  })
}

export const useToggleWebhookIntegration = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      service.toggleWebhookIntegration(companyId!, id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-integrations'] }),
    onError: (err: Error) => toast.error(err.message || 'Erro ao atualizar webhook'),
  })
}

export const useDeleteWebhookIntegration = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: (integrationId: string) =>
      service.deleteWebhookIntegration(companyId!, integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-integrations'] })
      toast.success('Webhook removido')
    },
    onError: (err: Error) => toast.error(err.message || 'Erro ao remover webhook'),
  })
}

export const useWebhookLogs = (integrationId?: string) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['webhook-logs', companyId, integrationId],
    queryFn: () => service.getWebhookLogs(companyId!, integrationId),
    enabled: !!companyId,
  })
}
