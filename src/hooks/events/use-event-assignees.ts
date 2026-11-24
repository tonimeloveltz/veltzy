import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getEventAssignees } from '@/services/event-assignees.service'

export const useEventAssignees = (eventId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event-assignees', eventId],
    queryFn: () => getEventAssignees(companyId!, eventId!),
    enabled: !!companyId && !!eventId,
    staleTime: 30_000,
  })
}
