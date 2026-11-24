import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getEvents } from '@/services/events.service'

/** Todos os eventos da empresa (nao excluidos). A lista separa as abas no client. */
export const useEvents = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['events', companyId],
    queryFn: () => getEvents(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  })
}
