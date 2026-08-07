import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

const useFeatureFlagQuery = (featureKey: string) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
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
}

export const useFeatureFlag = (featureKey: string): boolean => {
  const { data } = useFeatureFlagQuery(featureKey)
  return data ?? false
}

/**
 * Versao que expoe o estado de carregamento da flag. Necessaria para guards
 * de rota: enquanto isLoading, o consumidor NAO deve barrar/redirecionar
 * (senao um usuario com direito e jogado para fora durante o fetch assincrono).
 */
export const useFeatureFlagStatus = (
  featureKey: string,
): { enabled: boolean; isLoading: boolean } => {
  const { data, isLoading } = useFeatureFlagQuery(featureKey)
  return { enabled: data ?? false, isLoading }
}
