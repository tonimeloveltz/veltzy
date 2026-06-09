import type { DealWithLead, PipelineStage } from '@/types/database'
import type { HistoricalConversionRate } from '@/services/dashboard.service'

const DEFAULT_RATES: Record<number, number> = {
  0: 5,
  1: 15,
  2: 40,
  3: 70,
}

interface ForecastByStage {
  stage_id: string
  stage_name: string
  leads_count: number
  probability: number
  value: number
}

interface ForecastResult {
  total: number
  byStage: ForecastByStage[]
}

export const calculateForecast = (
  deals: DealWithLead[],
  stages: PipelineStage[],
  historicalRates: HistoricalConversionRate[],
): ForecastResult => {
  const finalStageIds = new Set(stages.filter((s) => s.is_final).map((s) => s.id))
  const activeDeals = deals.filter((d) => d.stage_id && !finalStageIds.has(d.stage_id) && d.status === 'open')

  const rateMap = new Map(historicalRates.map((r) => [r.stage_id, r.rate]))
  const stageMap = new Map(stages.map((s) => [s.id, s]))

  const byStageMap = new Map<string, ForecastByStage>()

  for (const deal of activeDeals) {
    if (!deal.stage_id) continue
    const stage = stageMap.get(deal.stage_id)
    if (!stage) continue

    const historicalRate = rateMap.get(deal.stage_id)
    const probability = historicalRate != null && historicalRate > 0
      ? historicalRate
      : DEFAULT_RATES[stage.position] ?? 10

    const dealValue = deal.value ?? 0
    const weighted = dealValue * (probability / 100)

    const existing = byStageMap.get(deal.stage_id)
    if (existing) {
      existing.leads_count++
      existing.value += weighted
    } else {
      byStageMap.set(deal.stage_id, {
        stage_id: deal.stage_id,
        stage_name: stage.name,
        leads_count: 1,
        probability,
        value: weighted,
      })
    }
  }

  const byStage = Array.from(byStageMap.values()).sort(
    (a, b) => (stageMap.get(a.stage_id)?.position ?? 0) - (stageMap.get(b.stage_id)?.position ?? 0)
  )

  const total = byStage.reduce((sum, s) => sum + s.value, 0)

  return { total, byStage }
}
