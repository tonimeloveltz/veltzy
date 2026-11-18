import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getEventFields } from '@/services/event-form-fields.service'

export const useEventFields = (eventId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event-fields', eventId],
    queryFn: () => getEventFields(companyId!, eventId!),
    enabled: !!companyId && !!eventId,
    staleTime: 30_000,
  })
}
