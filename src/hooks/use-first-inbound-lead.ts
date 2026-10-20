import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getFirstLeadSince } from '@/services/onboarding.service'

export const useFirstInboundLead = (since: string, enabled: boolean) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['onboarding-test-lead', companyId, since],
    queryFn: () => getFirstLeadSince(companyId!, since),
    enabled: !!companyId && enabled,
    // Para de consultar assim que achou o lead.
    refetchInterval: (query) => (query.state.data ? false : 3_000),
  })
}
