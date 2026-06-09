import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as goalsService from '@/services/goals.service'
import type { CreateGoalInput, UpdateGoalInput, GoalMetric, CreateGoalMetricInput } from '@/services/goals.service'
import { useDashboardDeals } from '@/hooks/use-deals'
import { calculateProgress } from '@/lib/goal-progress'

export const useGoals = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['goals', companyId],
    queryFn: () => goalsService.getGoals(companyId!),
    enabled: !!companyId,
    staleTime: 60 * 1000,
  })
}

export const useCreateGoal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: CreateGoalInput) =>
      goalsService.createGoal(companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Meta criada!')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useCreateGoalWithMetrics = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ goalInput, metrics }: { goalInput: CreateGoalInput; metrics: Omit<CreateGoalMetricInput, 'goal_id'>[] }) =>
      goalsService.createGoalWithMetrics(companyId!, goalInput, metrics),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Meta criada!')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useUpdateGoal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGoalInput }) =>
      goalsService.updateGoal(companyId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Meta atualizada!')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** Calcula o progresso de cada metrica da meta ativa, usando dados de deals */
export const useGoalProgress = (pipelineId?: string | null) => {
  const { data: goals } = useGoals()
  const { data: deals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)

  return useMemo(() => {
    if (!goals || !deals) return { isLoading: dealsLoading, progress: null }

    const now = new Date()
    const activeGoal = goals.find((g) => {
      if (!g.is_active) return false
      return new Date(g.start_date) <= now && new Date(g.end_date) >= now
    })

    if (!activeGoal?.goal_metrics?.length) return { isLoading: false, progress: null }

    const metrics = activeGoal.goal_metrics.map((metric: GoalMetric) => ({
      ...metric,
      ...calculateProgress(metric, deals, activeGoal.start_date, activeGoal.end_date),
    }))

    return {
      isLoading: false,
      progress: { goal: activeGoal, metrics },
    }
  }, [goals, deals, dealsLoading])
}

export const useDeleteGoal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (id: string) => goalsService.deleteGoal(companyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('Meta removida!')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
