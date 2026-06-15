import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { usePipelineStore } from '@/stores/pipeline.store'
import { useTeamMembers } from '@/hooks/use-team'
import * as leadsService from '@/services/leads.service'
import type { CreateLeadWithDealInput, UpdateLeadInput } from '@/types/database'

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

