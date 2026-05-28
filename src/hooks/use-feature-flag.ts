import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

export const useFeatureFlag = (featureKey: string): boolean => {
  const companyId = useAuthStore((s) => s.company?.id)

  const { data } = useQuery({
    queryKey: ['feature-flag', companyId, featureKey],
    queryFn: async () => {
      const { data: flag } = await supabase
        .from('tenant_feature_flags')
        .select('enabled')
        .eq('company_id', companyId!)
        .eq('feature_key', featureKey)
        .maybeSingle()

      return flag?.enabled ?? false
    },
    enabled: !!companyId,
    staleTime: 30_000,
  })

  return data ?? false
}
