import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import * as dashboardService from '@/services/dashboard.service'

/** Retorna profileId do vendedor para filtrar, ou undefined para admin/manager (ve tudo) */
const useSellerFilter = () => {
  const roles = useAuthStore((s) => s.roles)
  const profileId = useAuthStore((s) => s.profile?.id)
  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))
  return isSeller ? profileId : undefined
}

export const useDashboardMetrics = (days = 30, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['dashboard-metrics', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getConversionMetrics(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const useDashboardKpis = (days?: number, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['dashboard-kpis', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getDashboardKpis(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const useLeadsBySource = (days?: number, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['leads-by-source', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getLeadsBySource(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const usePipelineOverview = (days?: number, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['pipeline-overview', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getPipelineOverview(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const useMonthlyComparison = (days?: number, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['monthly-comparison', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getMonthlyComparison(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const useMonthlyComparisonGrid = (months = 6, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['monthly-comparison-grid', companyId, months, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getMonthlyComparisonGrid(companyId!, months, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const useHistoricalConversionRates = (days = 90, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['historical-conversion-rates', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getHistoricalConversionRates(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}

export const useSellerPerformance = (days?: number, pipelineId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const sellerProfileId = useSellerFilter()
  return useQuery({
    queryKey: ['seller-performance', companyId, days, pipelineId, sellerProfileId],
    queryFn: () => dashboardService.getSellerPerformance(companyId!, days, pipelineId ?? undefined, sellerProfileId),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
  })
}
