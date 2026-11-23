import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getRegistrationByDeal } from '@/services/event-registrations.service'

export const useDealRegistration = (dealId: string | null | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['deal-registration', dealId],
    queryFn: () => getRegistrationByDeal(companyId!, dealId!),
    enabled: !!companyId && !!dealId,
    staleTime: 60_000,
  })
}
