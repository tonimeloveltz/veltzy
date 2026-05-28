import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import * as metricsService from '@/services/sdr-v2-metrics.service'

export const useSdrV2Metrics = (pipelineId?: string, periodDays = 30) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['sdr-v2-metrics', companyId, pipelineId, periodDays],
    queryFn: () => metricsService.getSdrV2Metrics({
      companyId: companyId!,
      pipelineId,
      periodDays,
    }),
    enabled: !!companyId,
    refetchInterval: 60_000, // refresh a cada 1min
  })
}

export const useSdrV2Conversations = (pipelineId?: string, periodDays = 30) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['sdr-v2-conversations', companyId, pipelineId, periodDays],
    queryFn: () => metricsService.getSdrV2Conversations({
      companyId: companyId!,
      pipelineId,
      periodDays,
    }),
    enabled: !!companyId,
    refetchInterval: 60_000,
  })
}

export const useSdrV2ConversationDetail = (conversationId: string | undefined) => {
  return useQuery({
    queryKey: ['sdr-v2-conversation-detail', conversationId],
    queryFn: () => metricsService.getSdrV2ConversationDetail(conversationId!),
    enabled: !!conversationId,
  })
}
