import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { usePipelineStore } from '@/stores/pipeline.store'
import { useTeamMembers } from '@/hooks/use-team'
import { invalidateLeadDependentQueries } from '@/lib/query-keys'
import * as leadsService from '@/services/leads.service'
import type { UpdateLeadInput } from '@/types/database'

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

// Primeiro lead (mais recente) da empresa atual. Usado pelo Sandbox do SDR v2
// para obter um lead de teste REAL do tenant logado, em vez de um id hardcoded
// (que apontava para um lead de outra empresa -> mismatch lead<->company).
// Escopo por empresa (nao por pipeline): a associacao lead<->pipeline migrou
// para deals (deal-centrico), entao nao dependemos de leads.pipeline_id.
export const useFirstCompanyLead = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['first-company-lead', companyId],
    queryFn: async () => {
      const leads = await leadsService.getLeadsByCompany(companyId!, { limit: 1 })
      return leads[0] ?? null
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  })
}

export const useUpdateLead = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ leadId, data }: { leadId: string; data: UpdateLeadInput }) =>
      leadsService.updateLead(companyId!, leadId, data),
    onSuccess: () => {
      // Cobre ['leads'] + ['deals'] + metricas de estado atual do dashboard.
      // Os cards do kanban leem nome/telefone/tags do contato por dentro do
      // join da query de deals (DEAL_WITH_LEAD_SELECT). Sem o invalidate de
      // deals, o board so refletia a edicao por carona no invalidate do
      // useUpdateDeal, que nao roda quando o lead nao tem deal ativo.
      invalidateLeadDependentQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
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
      invalidateLeadDependentQueries(queryClient)
      toast.success('Lead removido!')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao remover lead')
    },
  })
}

