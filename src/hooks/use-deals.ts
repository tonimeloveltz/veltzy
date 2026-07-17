import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useTeamMembers } from '@/hooks/use-team'
import { invalidateDealDependentQueries } from '@/lib/query-keys'
import * as dealsService from '@/services/deals.service'
import type { CreateDealInput, UpdateDealInput, DealWithLead } from '@/types/database'

export const useDealsForKanban = (pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const { data: members } = useTeamMembers()

  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))
  const membersReady = !!members && members.length > 0

  return useQuery({
    queryKey: ['deals', 'kanban', companyId, pipelineId, isSeller ? profileId : null, membersReady],
    queryFn: async () => {
      const deals = await dealsService.getDealsForKanban(companyId!, pipelineId!)
      const profileMap = new Map(
        members?.map((m) => [m.id, { id: m.id, name: m.name, email: m.email }]) ?? []
      )
      if (isSeller) {
        return deals
          .filter((d) => d.assigned_to === profileId)
          .map((d) => ({ ...d, profiles: d.assigned_to ? profileMap.get(d.assigned_to) ?? null : null }))
      }
      return deals.map((d) => ({
        ...d,
        profiles: d.assigned_to ? profileMap.get(d.assigned_to) ?? null : null,
      }))
    },
    enabled: !!companyId && !!pipelineId,
    staleTime: 30 * 1000,
  })
}

export const useDashboardDeals = (pipelineId?: string | null, showArchived = false) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const { data: members } = useTeamMembers()

  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))
  const membersReady = !!members && members.length > 0

  return useQuery({
    queryKey: ['deals', 'dashboard', companyId, pipelineId, showArchived, isSeller ? profileId : null, membersReady],
    queryFn: async () => {
      const deals = await dealsService.getDealsByCompany(companyId!, {
        pipelineId: pipelineId ?? undefined,
        assignedTo: isSeller ? profileId : undefined,
        limit: 500,
      })
      const profileMap = new Map(
        members?.map((m) => [m.id, { id: m.id, name: m.name, email: m.email }]) ?? []
      )
      return deals.map((d) => ({
        ...d,
        profiles: d.assigned_to ? profileMap.get(d.assigned_to) ?? null : null,
      }))
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  })
}

export const useDealsByLead = (leadId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['deals', 'lead', companyId, leadId],
    queryFn: () => dealsService.getDealsByLead(companyId!, leadId!),
    enabled: !!companyId && !!leadId,
    staleTime: 30 * 1000,
  })
}

export const useCreateDeal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: CreateDealInput) => dealsService.createDeal(companyId!, input),
    onSuccess: () => {
      invalidateDealDependentQueries(queryClient)
      // Contagem de Negocios e LTV do contato mudam na pagina Contatos
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Negocio criado com sucesso!')
    },
    onError: (err: Error & { code?: string }) => {
      if (err.message?.includes('duplicate') || err.message?.includes('unique') || err.code === '23505') {
        toast.error('Este contato já tem um negócio ativo neste pipeline')
      } else {
        toast.error(err.message || 'Erro ao criar negócio')
      }
    },
  })
}

export const useUpdateDeal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ dealId, data }: { dealId: string; data: UpdateDealInput }) =>
      dealsService.updateDeal(companyId!, dealId, data),
    onSuccess: () => {
      invalidateDealDependentQueries(queryClient)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar negocio')
    },
  })
}

export const useDeleteDeal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (dealId: string) => dealsService.deleteDeal(companyId!, dealId),
    onSuccess: () => {
      invalidateDealDependentQueries(queryClient)
      // Contagem de Negocios e LTV do contato caem na pagina Contatos
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Negocio removido!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao remover negocio')
    },
  })
}

export const useMoveDealStage = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  const kanbanFilter = { queryKey: ['deals', 'kanban'] }

  return useMutation({
    mutationFn: ({ dealId, stageId, pipelineId, status }: { dealId: string; stageId: string; pipelineId?: string; status?: DealWithLead['status'] }) =>
      dealsService.moveDealStage(companyId!, dealId, stageId, pipelineId, status),
    onMutate: async ({ dealId, stageId, status }) => {
      await queryClient.cancelQueries(kanbanFilter)

      queryClient.setQueriesData<DealWithLead[]>(
        kanbanFilter,
        (old) => old?.map((d) => (d.id === dealId ? { ...d, stage_id: stageId, ...(status ? { status } : {}) } : d))
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.error('Erro ao mover negocio. Tente novamente.')
    },
    onSettled: () => {
      invalidateDealDependentQueries(queryClient)
    },
  })
}

export const useUpdateDealValueAndMove = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  const kanbanFilter = { queryKey: ['deals', 'kanban'] }

  return useMutation({
    mutationFn: ({ dealId, stageId, value }: { dealId: string; stageId: string; value: number }) =>
      dealsService.updateDealValueAndMove(companyId!, dealId, stageId, value),
    onMutate: async ({ dealId, stageId, value }) => {
      await queryClient.cancelQueries(kanbanFilter)

      queryClient.setQueriesData<DealWithLead[]>(
        kanbanFilter,
        (old) => old?.map((d) => (d.id === dealId ? { ...d, stage_id: stageId, value } : d))
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.error('Erro ao mover negocio. Tente novamente.')
    },
    onSettled: () => {
      invalidateDealDependentQueries(queryClient)
    },
  })
}

export const useMoveDealToPipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ dealId, targetPipelineId }: { dealId: string; targetPipelineId: string }) =>
      dealsService.moveDealToPipeline(companyId!, dealId, targetPipelineId),
    onSuccess: () => {
      invalidateDealDependentQueries(queryClient)
      toast.success('Negocio movido para o novo pipeline!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao mover negocio de pipeline')
    },
  })
}

export const useCloseDeal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ dealId, pipelineId, outcome }: { dealId: string; pipelineId: string; outcome: 'won' | 'lost' }) =>
      dealsService.closeDeal(companyId!, dealId, pipelineId, outcome),
    onSuccess: (_, { outcome }) => {
      invalidateDealDependentQueries(queryClient)
      if (outcome === 'won') {
        toast.success('Negocio fechado com sucesso! 🎉')
      } else {
        toast.info('Negocio marcado como perdido')
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao fechar negocio')
    },
  })
}

export const useAssignDeal = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ dealId, userId }: { dealId: string; userId: string }) =>
      dealsService.assignDeal(companyId!, dealId, userId),
    onSuccess: () => {
      invalidateDealDependentQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Negocio atribuido com sucesso!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atribuir negocio')
    },
  })
}
