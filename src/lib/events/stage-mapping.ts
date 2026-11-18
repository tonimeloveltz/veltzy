// Mapeamento das etapas do evento ao trocar de pipeline (aba 4).

export interface StageLike {
  id: string
  slug: string
  position: number
}

export interface StageMapping {
  entry_stage_id: string
  confirmed_stage_id: string
  present_stage_id: string
  absent_stage_id: string
}

// Slugs das etapas que o create_event_pipeline cria.
const SLUGS: Record<keyof StageMapping, string> = {
  entry_stage_id: 'inscrito',
  confirmed_stage_id: 'confirmado',
  present_stage_id: 'presente',
  absent_stage_id: 'nao-compareceu',
}

/** Casa por slug; a entrada cai na primeira etapa quando nao ha "inscrito". Sem par, fica vazio. */
export const autoMapStages = (stages: StageLike[]): StageMapping => {
  const sorted = [...stages].sort((a, b) => a.position - b.position)
  const bySlug = (slug: string) => sorted.find((s) => s.slug === slug)?.id ?? ''
  return {
    entry_stage_id: bySlug(SLUGS.entry_stage_id) || (sorted[0]?.id ?? ''),
    confirmed_stage_id: bySlug(SLUGS.confirmed_stage_id),
    present_stage_id: bySlug(SLUGS.present_stage_id),
    absent_stage_id: bySlug(SLUGS.absent_stage_id),
  }
}
