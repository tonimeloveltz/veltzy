import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getLeadTags } from '@/services/lead-tags.service'
import { normalizeTagKey } from '@/lib/tag-colors'

export const leadTagsQueryKey = (companyId: string | undefined) => ['lead-tags', companyId] as const

/** Catalogo de tags da empresa + mapa nome normalizado -> cor. */
export const useLeadTags = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  const query = useQuery({
    queryKey: leadTagsQueryKey(companyId),
    queryFn: () => getLeadTags(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  })

  const colorByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of query.data ?? []) map.set(normalizeTagKey(tag.name), tag.color)
    return map
  }, [query.data])

  const getTagColor = (name: string): string | undefined => colorByName.get(normalizeTagKey(name))

  return { ...query, getTagColor }
}
