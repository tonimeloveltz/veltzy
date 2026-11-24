import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getEventCounts } from '@/services/events.service'

/** Inscritos, confirmados e presentes dos eventos visiveis. */
export const useEventCounts = (eventIds: string[]) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const ids = [...eventIds].sort()
  return useQuery({
    queryKey: ['event-counts', companyId, ids],
    queryFn: () => getEventCounts(companyId!, ids),
    enabled: !!companyId && ids.length > 0,
    staleTime: 30_000,
  })
}
