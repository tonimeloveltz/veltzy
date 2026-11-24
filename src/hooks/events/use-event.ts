import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getEventById } from '@/services/events.service'

export const useEvent = (id: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => getEventById(companyId!, id!),
    enabled: !!companyId && !!id,
    staleTime: 30_000,
  })
}
