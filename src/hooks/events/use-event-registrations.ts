import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { listRegistrations, type RegistrationFilters } from '@/services/event-registrations.service'

export const useEventRegistrations = (eventId: string, filters: RegistrationFilters) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event-registrations', eventId, filters],
    queryFn: () => listRegistrations(companyId!, eventId, filters),
    enabled: !!companyId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}
