import type { DealWithLead } from '@/types/database'

export interface ActiveDealInfo {
  /** lead_ids que tem ao menos um negocio ABERTO (status 'open'). */
  activeLeadIds: Set<string>
  /** lead_id -> stage_id do deal ABERTO mais recente do lead. */
  stageByLeadId: Map<string, string>
  /** lead_id -> pipeline_id do deal ABERTO mais recente do lead. */
  pipelineByLeadId: Map<string, string>
}

/**
 * Deriva, a partir dos deals, a informacao de negocio por lead que os cards de
 * dica do dashboard precisam — sem depender mais de leads.stage_id.
 *
 * "Ativo" = tem deal com status 'open' (equivale a estagio nao-final, ja que o
 * status so vira won/lost em estagio final). Multi-deal: o stage usado e o do
 * deal aberto MAIS RECENTE (por created_at). Lead sem deal aberto fica de fora.
 *
 * `pipelineByLeadId` entrou na Onda 4, quando `leads.pipeline_id` saiu: esta e a
 * regra unica de "qual negocio representa o contato", entao quem precisa do
 * pipeline representativo usa daqui em vez de reimplementar o criterio. Cada
 * mapa tem seu proprio controle de "mais recente" porque nem todo deal tem
 * stage e pipeline preenchidos ao mesmo tempo.
 */
export const buildActiveDealInfo = (deals: DealWithLead[] | undefined): ActiveDealInfo => {
  const activeLeadIds = new Set<string>()
  const stageByLeadId = new Map<string, string>()
  const pipelineByLeadId = new Map<string, string>()
  const chosenAt = new Map<string, string>()
  const pipelineChosenAt = new Map<string, string>()

  for (const d of deals ?? []) {
    if (d.status !== 'open' || !d.lead_id) continue
    activeLeadIds.add(d.lead_id)
    const prev = chosenAt.get(d.lead_id)
    if (d.stage_id && (!prev || d.created_at > prev)) {
      chosenAt.set(d.lead_id, d.created_at)
      stageByLeadId.set(d.lead_id, d.stage_id)
    }
    const prevPipeline = pipelineChosenAt.get(d.lead_id)
    if (d.pipeline_id && (!prevPipeline || d.created_at > prevPipeline)) {
      pipelineChosenAt.set(d.lead_id, d.created_at)
      pipelineByLeadId.set(d.lead_id, d.pipeline_id)
    }
  }

  return { activeLeadIds, stageByLeadId, pipelineByLeadId }
}
