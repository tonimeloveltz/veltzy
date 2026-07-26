import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import {
  createRoutingRule,
  deleteRoutingRule,
  listRoutingRules,
  updateRoutingRule,
} from '@/services/pipeline-routing-rules.service'
import type { RoutingMatchType } from '@/types/database'

export const useRoutingRules = (pipelineId?: string) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['pipeline-routing-rules', companyId, pipelineId],
    queryFn: () => listRoutingRules(companyId!, pipelineId),
    enabled: !!companyId && !!pipelineId,
  })
}

export const useCreateRoutingRule = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { pipelineId: string; matchType: RoutingMatchType; matchValue: string }) =>
      createRoutingRule(companyId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-routing-rules'] }),
  })
}

export const useUpdateRoutingRule = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; patch: { matchValue?: string; isActive?: boolean } }) =>
      updateRoutingRule(companyId!, args.id, args.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-routing-rules'] }),
  })
}

export const useDeleteRoutingRule = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRoutingRule(companyId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-routing-rules'] }),
  })
}
