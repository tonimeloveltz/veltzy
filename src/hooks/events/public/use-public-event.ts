import { useQuery } from '@tanstack/react-query'
import { fetchPublicEvent, PublicNotFound } from '@/services/event-public.service'

export const usePublicEvent = (slug: string | undefined) =>
  useQuery({
    queryKey: ['public-event', slug],
    queryFn: () => fetchPublicEvent(slug!),
    enabled: !!slug,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof PublicNotFound) && count < 1,
  })
