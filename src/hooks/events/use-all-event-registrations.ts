import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { listAllRegistrations } from '@/services/event-registrations.service'

/** Todas as inscricoes (painel, divulgadores, check-in). `refetchMs` liga o refetch periodico. */
export const useAllEventRegistrations = (eventId: string | undefined, refetchMs?: number) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event-registrations-all', eventId],
    queryFn: () => listAllRegistrations(companyId!, eventId!),
    enabled: !!companyId && !!eventId,
    staleTime: 15_000,
    refetchInterval: refetchMs,
  })
}
