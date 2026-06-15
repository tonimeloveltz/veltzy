import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { usePipelineStore } from '@/stores/pipeline.store'
import { useTeamMembers } from '@/hooks/use-team'
import * as leadsService from '@/services/leads.service'
import type { CreateLeadWithDealInput, UpdateLeadInput, LeadWithDetails } from '@/types/database'

export const useLeads = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const filters = usePipelineStore((s) => s.filters)
  const activePipelineId = usePipelineStore((s) => s.activePipelineId)
  const { data: members } = useTeamMembers()

  // Vendedor so ve seus proprios leads
  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))
  const assignedToFilter = isSeller ? profileId : filters.assignedTo

  const membersReady = !!members && members.length > 0

  return useQuery({
    queryKey: ['leads', companyId, activePipelineId, filters.sourceId, filters.temperature, assignedToFilter, membersReady],
    queryFn: async () => {
      const leads = await leadsService.getLeadsByCompany(companyId!, {
        pipelineId: activePipelineId!,
        sourceId: filters.sourceId,
        temperature: filters.temperature,
        assignedTo: assignedToFilter,
      })
      const profileMap = new Map(
        members?.map((m) => [m.id, { id: m.id, name: m.name, email: m.email }]) ?? []
      )
      return leads.map((lead) => ({
        ...lead,
        profiles: lead.assigned_to ? profileMap.get(lead.assigned_to) ?? null : null,
      }))
    },
    enabled: !!companyId && !!activePipelineId,
    staleTime: 30 * 1000,
  })
}

const useLeadsQueryKey = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const filters = usePipelineStore((s) => s.filters)
  const activePipelineId = usePipelineStore((s) => s.activePipelineId)
  return ['leads', companyId, activePipelineId, filters.sourceId, filters.temperature, filters.assignedTo] as const
}

export const useCreateLead = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: CreateLeadWithDealInput) => leadsService.createLeadWithDeal(companyId!, input),
    onSuccess: () => {
      // Contato + negocio nascem juntos: invalidar leads, deals (kanban) e dashboard
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Negocio criado com sucesso!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao criar negocio')
    },
  })
}

export const useUpdateLead = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ leadId, data }: { leadId: string; data: UpdateLeadInput }) =>
      leadsService.updateLead(companyId!, leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead atualizado!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar lead')
    },
  })
}

export const useDeleteLead = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (leadId: string) => leadsService.deleteLead(companyId!, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead removido!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao remover lead')
    },
  })
}

export const useMoveLeadToStage = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const queryKey = useLeadsQueryKey()

  return useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      leadsService.moveLeadToStage(companyId!, leadId, stageId),
    onMutate: async ({ leadId, stageId }) => {
      await queryClient.cancelQueries({ queryKey })
      const previousLeads = queryClient.getQueryData<LeadWithDetails[]>(queryKey)

      queryClient.setQueryData<LeadWithDetails[]>(
        queryKey,
        (old) => old?.map((lead) => (lead.id === leadId ? { ...lead, stage_id: stageId } : lead))
      )

      return { previousLeads }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(queryKey, context.previousLeads)
      }
      toast.error('Erro ao mover lead. Tente novamente.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export const useUpdateDealValueAndMove = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const queryKey = useLeadsQueryKey()

  return useMutation({
    mutationFn: ({ leadId, stageId, dealValue }: { leadId: string; stageId: string; dealValue: number }) =>
      leadsService.updateDealValueAndMove(companyId!, leadId, stageId, dealValue),
    onMutate: async ({ leadId, stageId, dealValue }) => {
      await queryClient.cancelQueries({ queryKey })
      const previousLeads = queryClient.getQueryData<LeadWithDetails[]>(queryKey)

      queryClient.setQueryData<LeadWithDetails[]>(
        queryKey,
        (old) => old?.map((lead) => (lead.id === leadId ? { ...lead, stage_id: stageId, deal_value: dealValue } : lead))
      )

      return { previousLeads }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(queryKey, context.previousLeads)
      }
      toast.error('Erro ao mover lead. Tente novamente.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export const useMoveLeadToPipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ leadId, targetPipelineId }: { leadId: string; targetPipelineId: string }) =>
      leadsService.moveLeadToPipeline(companyId!, leadId, targetPipelineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead movido para outro pipeline')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao mover lead')
    },
  })
}
