import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { countEventDealsBy } from '@/services/event-pipeline-stats.service'

/** Negocios do evento por etapa ou por responsavel (aba 4). */
export const useEventDealCounts = (eventId: string, column: 'stage_id' | 'assigned_to', values: string[]) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sorted = [...values].filter(Boolean).sort()
  return useQuery({
    queryKey: ['event-deal-counts', eventId, column, sorted],
    queryFn: () => countEventDealsBy(companyId!, eventId, column, sorted),
    enabled: !!companyId && sorted.length > 0,
    staleTime: 30_000,
  })
}
