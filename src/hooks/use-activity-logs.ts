import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getActivityLogs, getActivityLogsByResource } from '@/services/activity-logs.service'

export const useActivityLogs = (limit = 50, offset = 0) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['activity-logs', companyId, limit, offset],
    queryFn: () => getActivityLogs(companyId!, limit, offset),
    enabled: !!companyId,
  })
}

// Historico do contato. Continua vivo depois da Onda 1 do historico-por-negocio:
// e ele que alimenta o bloco "Antes da separacao" da aba Historico.
export const useLeadActivityLogs = (leadId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['activity-logs', 'lead', leadId],
    queryFn: () => getActivityLogsByResource(companyId!, 'lead', leadId!),
    enabled: !!companyId && !!leadId,
  })
}

// Historico do negocio (resource_type='deal'), gravado por trg_log_deal_activity.
export const useDealActivityLogs = (dealId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['activity-logs', 'deal', dealId],
    queryFn: () => getActivityLogsByResource(companyId!, 'deal', dealId!),
    enabled: !!companyId && !!dealId,
  })
}
