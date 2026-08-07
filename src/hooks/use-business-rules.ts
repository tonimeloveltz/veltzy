import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { veltzy } from '@/lib/supabase'

interface BusinessRules {
  fallback_role: string
  fallback_lead_owner: string | null
  round_robin_enabled: boolean
  handover_enabled: boolean
  ai_reactivation_enabled: boolean
  ai_scoring_enabled: boolean
  ai_score_threshold: number
  audio_enabled: boolean
  lead_limit_enabled: boolean
  lead_limit_per_seller: number
  sla_alert_enabled: boolean
  sla_hours: number
  followup_alert_enabled: boolean
  followup_days: number
  require_deal_value: boolean
  min_score_to_advance: boolean
  min_score_value: number
}

const defaults: BusinessRules = {
  fallback_role: 'admin',
  fallback_lead_owner: null,
  round_robin_enabled: true,
  handover_enabled: true,
  ai_reactivation_enabled: true,
  ai_scoring_enabled: false,
  ai_score_threshold: 0,
  audio_enabled: true,
  lead_limit_enabled: false,
  lead_limit_per_seller: 50,
  sla_alert_enabled: false,
  sla_hours: 2,
  followup_alert_enabled: false,
  followup_days: 7,
  require_deal_value: false,
  min_score_to_advance: false,
  min_score_value: 0,
}

export const useBusinessRules = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['business-rules', companyId],
    queryFn: async () => {
      const { data } = await veltzy()
        .from('system_settings')
        .select('value')
        .eq('company_id', companyId!)
        .eq('key', 'business_rules')
        .maybeSingle()
      return { ...defaults, ...(data?.value as Partial<BusinessRules> ?? {}) }
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
}
