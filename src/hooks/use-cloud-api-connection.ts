import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { veltzy } from '@/lib/supabase'

interface CloudApiConnection {
  connected: boolean
  number: string | null
}

/**
 * Hidrata o estado do card oficial a partir do servidor: verifica se a empresa
 * logada ja possui um numero oficial ativo em cloud_api_numbers. O numero padrao
 * (is_default) tem prioridade de exibicao. Compartilha a queryKey invalidada pelo
 * onboarding (['cloud-api-numbers']) para refletir uma conexao recem-feita.
 */
export const useCloudApiConnection = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  const query = useQuery({
    queryKey: ['cloud-api-numbers', companyId],
    queryFn: async (): Promise<CloudApiConnection> => {
      const { data, error } = await veltzy()
        .from('cloud_api_numbers')
        .select('display_number, is_default')
        .eq('company_id', companyId!)
        .eq('status', 'active')
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error

      return {
        connected: !!data,
        number: data?.display_number ?? null,
      }
    },
    enabled: !!companyId,
  })

  return {
    connected: query.data?.connected ?? false,
    number: query.data?.number ?? null,
    // Enquanto o companyId nao chegou do auth store, o query fica disabled e
    // query.isLoading e false (fetchStatus 'idle'). Tratamos essa janela como
    // loading para o card nao decidir "Conectar" antes de ter a resposta.
    isLoading: !companyId || query.isLoading,
  }
}
