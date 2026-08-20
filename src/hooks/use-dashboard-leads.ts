import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { useTeamMembers } from '@/hooks/use-team'
import * as leadsService from '@/services/leads.service'

/**
 * Hook para buscar leads no contexto do dashboard, independente do store do Kanban.
 * Quando pipelineId é null/undefined, busca todos os leads (sem filtro de pipeline).
 * Quando pipelineId é uma string, filtra por aquele pipeline.
 */
export const useDashboardLeads = (pipelineId?: string | null, showArchived = false) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const { data: members } = useTeamMembers()

  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))
  const membersReady = !!members && members.length > 0

  return useQuery({
    queryKey: ['dashboard-leads', companyId, pipelineId, showArchived, isSeller ? profileId : null, membersReady],
    queryFn: async () => {
      // Sem recorte por pipeline: a coluna saiu de `leads` na Onda 4, e aqui ele
      // ja era redundante. Quem consome (`CopilotLocalTips`) cruza com os
      // `activeLeadIds` do `useDashboardDeals(pipelineId)`, entao o recorte por
      // funil vem da intersecao, nao desta query.
      const leads = await leadsService.getLeadsByCompany(companyId!, {
        assignedTo: isSeller ? profileId : undefined,
        limit: 500,
      })
      const profileMap = new Map(
        members?.map((m) => [m.id, { id: m.id, name: m.name, email: m.email }]) ?? []
      )
      return leads.map((lead) => ({
        ...lead,
        profiles: lead.assigned_to ? profileMap.get(lead.assigned_to) ?? null : null,
      }))
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  })
}
