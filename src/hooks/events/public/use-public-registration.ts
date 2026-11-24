import { useQuery } from '@tanstack/react-query'
import { fetchRegistration, PublicNotFound } from '@/services/event-public.service'

export const usePublicRegistration = (token: string | undefined) =>
  useQuery({
    queryKey: ['public-registration', token],
    queryFn: () => fetchRegistration(token!),
    enabled: !!token,
    retry: (count, err) => !(err instanceof PublicNotFound) && count < 1,
  })
