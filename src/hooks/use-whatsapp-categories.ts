import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getWhatsAppCategories } from '@/services/whatsapp-categories.service'

export const useWhatsAppCategories = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['whatsapp-categories', companyId],
    queryFn: () => getWhatsAppCategories(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  })
}
