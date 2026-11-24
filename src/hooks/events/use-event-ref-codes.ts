import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getRefCodes } from '@/services/event-ref-codes.service'

export const useEventRefCodes = (eventId: string) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event-ref-codes', eventId],
    queryFn: () => getRefCodes(companyId!, eventId),
    enabled: !!companyId,
  })
}
