import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { useTeamMembers } from '@/hooks/use-team'
import * as leadsService from '@/services/leads.service'
import * as dealsService from '@/services/deals.service'
import { aggregateDealsByLead } from '@/lib/contacts-aggregate'
import type { LeadWithDetails } from '@/types/database'

export interface ContactRow extends LeadWithDetails {
  dealCount: number
  ltv: number
}

/**
 * Lista plana de contatos (1 linha por lead, todos os pipelines) enriquecida
 * com contagem de negocios e LTV agregados de `deals` por lead_id.
 * Vendedor ve apenas os proprios contatos, alinhado a useLeads/useDashboardDeals.
 */
export const useContacts = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const { data: members } = useTeamMembers()

  const isSeller = roles.length > 0 && !roles.some((r) => ['admin', 'manager', 'super_admin'].includes(r))
  const membersReady = !!members && members.length > 0

  return useQuery<ContactRow[]>({
    queryKey: ['contacts', companyId, isSeller ? profileId : null, membersReady],
    queryFn: async () => {
      const [leads, deals] = await Promise.all([
        leadsService.getLeadsByCompany(companyId!, {
          assignedTo: isSeller ? profileId : undefined,
          limit: 0, // sem limite: lista plana de todos os contatos
        }),
        dealsService.getDealsByCompany(companyId!, {
          assignedTo: isSeller ? profileId : undefined,
          limit: 0,
        }),
      ])

      const agg = aggregateDealsByLead(deals)
      const profileMap = new Map(
        members?.map((m) => [m.id, { id: m.id, name: m.name, email: m.email }]) ?? []
      )

      return leads.map((lead) => ({
        ...lead,
        profiles: lead.assigned_to ? profileMap.get(lead.assigned_to) ?? null : null,
        dealCount: agg.get(lead.id)?.count ?? 0,
        ltv: agg.get(lead.id)?.ltv ?? 0,
      }))
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  })
}
