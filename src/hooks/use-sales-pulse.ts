import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

export interface SalesPulseAlerta {
  tipo: 'urgente' | 'oportunidade' | 'atencao'
  texto: string
  lead_id?: string | null
}

export interface SalesPulseAcao {
  texto: string
  lead_id: string | null
  destino: 'inbox' | 'pipeline' | 'deals'
}

export interface SalesPulseData {
  situacao: string
  alertas: SalesPulseAlerta[]
  acoes: SalesPulseAcao[]
}

const getCacheKey = (companyId: string) => {
  const today = new Date().toISOString().slice(0, 10)
  return `sales_pulse_${companyId}_${today}`
}

const getFromCache = (companyId: string): SalesPulseData | null => {
  try {
    const raw = sessionStorage.getItem(getCacheKey(companyId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const saveToCache = (companyId: string, data: SalesPulseData) => {
  try {
    sessionStorage.setItem(getCacheKey(companyId), JSON.stringify(data))
  } catch { /* ignore quota errors */ }
}

export function useSalesPulse() {
  const company = useAuthStore((s) => s.company)
  const profile = useAuthStore((s) => s.profile)
  const roles = useAuthStore((s) => s.roles)
  const queryClient = useQueryClient()

  const role = roles.includes('admin') || roles.includes('manager') || roles.includes('super_admin')
    ? 'admin'
    : 'seller'

  // Contrato hibrido: retorna SalesPulseData quando a empresa TEM acesso de IA e a
  // edge respondeu com payload valido; retorna null em QUALQUER modo de falha
  // (403 sem acesso, ok:false, 5xx, timeout, erro de rede/excecao). Nunca lanca —
  // null sinaliza ao card para cair no fallback heuristico local. O card nunca quebra.
  const query = useQuery<SalesPulseData | null>({
    queryKey: ['sales-pulse', company?.id],
    queryFn: async () => {
      // Cache primeiro (staleTime 10min + sessionStorage por dia): segura custo por pageview.
      if (company?.id) {
        const cached = getFromCache(company.id)
        if (cached) return cached
      }

      try {
        // company_id = tenant dono (useAuthStore): e o que faz check_ai_access e o
        // log de custo baterem por empresa no gateway. Nao trocar a fonte.
        const { data, error } = await supabase.functions.invoke('ai-copilot', {
          body: {
            action: 'sales-pulse',
            company_id: company?.id,
            user_profile_id: profile?.id,
            user_name: profile?.name,
            role,
          },
        })

        // Qualquer erro (403 do gate, 5xx) degrada para o fallback.
        if (error) return null

        // Defesa de shape: { ok:false } ou resposta sem 'situacao' tambem degrada.
        const result = data as (Partial<SalesPulseData> & { ok?: boolean }) | null
        if (!result || result.ok === false || typeof result.situacao !== 'string') {
          return null
        }

        const pulse = result as SalesPulseData
        if (company?.id) saveToCache(company.id, pulse)
        return pulse
      } catch {
        // Erro de rede/excecao: degrada para o fallback, sem quebrar o card.
        return null
      }
    },
    enabled: !!company?.id,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: company?.id ? getFromCache(company.id) ?? undefined : undefined,
  })

  const refresh = () => {
    if (company?.id) {
      sessionStorage.removeItem(getCacheKey(company.id))
    }
    queryClient.invalidateQueries({ queryKey: ['sales-pulse', company?.id] })
  }

  return { ...query, refresh }
}
