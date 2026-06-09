import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

const DASHBOARD_QUERY_KEYS = [
  'dashboard-kpis',
  'leads',
  'pipeline-overview',
  'historical-conversion-rates',
  'monthly-comparison-grid',
  'monthly-comparison',
  'leads-by-source',
  'seller-performance',
  'dashboard-metrics',
  'deals',
]

export const useDashboardRealtime = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  useEffect(() => {
    if (!companyId) return

    const invalidateAll = () => {
      DASHBOARD_QUERY_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] })
      })
    }

    const channel = supabase
      .channel(`dashboard:${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'veltzy',
          table: 'leads',
          filter: `company_id=eq.${companyId}`,
        },
        invalidateAll
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'veltzy',
          table: 'deals',
          filter: `company_id=eq.${companyId}`,
        },
        invalidateAll
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, queryClient])
}
