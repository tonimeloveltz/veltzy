import type { GoalMetric, MetricType } from '@/services/goals.service'
import type { Deal } from '@/types/database'

interface ProgressResult {
  current: number | null
  target: number
  percentage: number | null
}

const isInPeriod = (dateStr: string, startDate: string, endDate: string): boolean => {
  const date = new Date(dateStr)
  return date >= new Date(startDate) && date <= new Date(endDate)
}

const filterByScope = (deals: Deal[], metric: GoalMetric): Deal[] => {
  if (metric.applies_to === 'individual' && metric.profile_id) {
    return deals.filter((d) => d.assigned_to === metric.profile_id)
  }
  return deals
}

export const calculateProgress = (
  metric: GoalMetric,
  deals: Deal[],
  startDate: string,
  endDate: string
): ProgressResult => {
  const scopedDeals = filterByScope(deals, metric)
  const periodDeals = scopedDeals.filter((d) => isInPeriod(d.created_at, startDate, endDate))

  const calculators: Record<MetricType, () => ProgressResult> = {
    revenue: () => {
      const current = periodDeals
        .filter((d) => d.status === 'won')
        .reduce((sum, d) => sum + (d.value ?? 0), 0)
      return {
        current,
        target: metric.target_value,
        percentage: metric.target_value > 0 ? Math.round((current / metric.target_value) * 100) : 0,
      }
    },

    deals_closed: () => {
      const current = periodDeals.filter((d) => d.status === 'won').length
      return {
        current,
        target: metric.target_value,
        percentage: metric.target_value > 0 ? Math.round((current / metric.target_value) * 100) : 0,
      }
    },

    leads_attended: () => {
      const current = periodDeals.filter((d) => d.assigned_to !== null).length
      return {
        current,
        target: metric.target_value,
        percentage: metric.target_value > 0 ? Math.round((current / metric.target_value) * 100) : 0,
      }
    },

    conversion_rate: () => {
      const total = periodDeals.length
      const won = periodDeals.filter((d) => d.status === 'won').length
      const current = total > 0 ? Math.round((won / total) * 100) : 0
      return {
        current,
        target: metric.target_value,
        percentage: metric.target_value > 0 ? Math.round((current / metric.target_value) * 100) : 0,
      }
    },

    avg_response_time: () => ({
      current: null,
      target: metric.target_value,
      percentage: null,
    }),
  }

  return calculators[metric.metric_type]()
}
