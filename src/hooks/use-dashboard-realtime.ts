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

    // Usar eventos especificos (INSERT/UPDATE/DELETE) em vez de '*',
    // seguindo o padrao do useMessages (inbox) que funciona.
    const channel = supabase
      .channel(`dashboard:${companyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'veltzy', table: 'deals', filter: `company_id=eq.${companyId}` }, invalidateAll)
      .on('postgres_changes', { event: 'UPDATE', schema: 'veltzy', table: 'deals', filter: `company_id=eq.${companyId}` }, invalidateAll)
      .on('postgres_changes', { event: 'DELETE', schema: 'veltzy', table: 'deals', filter: `company_id=eq.${companyId}` }, invalidateAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'veltzy', table: 'leads', filter: `company_id=eq.${companyId}` }, invalidateAll)
      .on('postgres_changes', { event: 'UPDATE', schema: 'veltzy', table: 'leads', filter: `company_id=eq.${companyId}` }, invalidateAll)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.debug('[Dashboard Realtime] Subscribed to leads + deals')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Dashboard Realtime] Channel error — falling back to polling')
        } else if (status === 'TIMED_OUT') {
          console.warn('[Dashboard Realtime] Timed out — falling back to polling')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, queryClient])
}
