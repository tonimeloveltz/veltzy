import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { isValidSlug } from '@/lib/events/slug'
import { isEventSlugAvailable } from '@/services/events.service'

export type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

/** Checa o slug com 400 ms de debounce. O proprio slug salvo conta como disponivel. */
export const useSlugAvailability = (slug: string, eventId: string, savedSlug: string): SlugState => {
  const debounced = useDebouncedValue(slug, 400)
  const valid = isValidSlug(debounced)
  const query = useQuery({
    queryKey: ['event-slug', debounced, eventId],
    queryFn: () => isEventSlugAvailable(debounced, eventId),
    enabled: valid && debounced !== savedSlug,
    staleTime: 10_000,
  })
  if (slug === savedSlug) return 'idle'
  if (!isValidSlug(slug)) return 'invalid'
  if (debounced !== slug || query.isFetching) return 'checking'
  if (query.data === true) return 'available'
  if (query.data === false) return 'taken'
  return 'checking'
}
