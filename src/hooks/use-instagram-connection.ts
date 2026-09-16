import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getInstagramConnection } from '@/services/instagram.service'

export const INSTAGRAM_CONNECTION_QUERY_KEY = 'instagram-connection'

export const useInstagramConnection = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: [INSTAGRAM_CONNECTION_QUERY_KEY, companyId],
    queryFn: () => getInstagramConnection(companyId!),
    enabled: !!companyId,
  })
}
