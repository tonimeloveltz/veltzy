// Traducao do audience_filter da campanha (mkt-ativo) em um "plano" aplicavel na
// query de veltzy.leads. Logica PURA e testavel: valida/normaliza o filtro e diz
// QUAIS predicados aplicar; a edge aplica o plano no query builder do Supabase.
//
// Fase 1: filtros diretos do lead (status, temperature, tags, source_id).
// pipeline/stage envolvem join com veltzy.deals (o stage real vive no deal, nao no
// lead) — fora da parte comum; anotado como pendencia coordenada.

export interface AudienceFilter {
  status?: string[]
  temperature?: string[]
  tags?: string[]
  source_id?: string
  // pipeline_id / stage_id: Fase 1+ (join com deals) — ignorados aqui de proposito.
  [key: string]: unknown
}

export interface AudiencePlan {
  statusIn?: string[]
  temperatureIn?: string[]
  tagsOverlap?: string[] // lead.tags && filtro (qualquer tag em comum)
  sourceEq?: string
  // Sempre verdadeiros na edge, explicitados aqui para o teste documentar a regra:
  companyScoped: true // .eq('company_id', companyId)
  excludeOptOut: true // .eq('marketing_opt_out', false)
}

const cleanStrings = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const arr = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  return arr.length > 0 ? arr : undefined
}

/**
 * Normaliza o audience_filter num plano. Campos vazios/ausentes/invalidos sao
 * OMITIDOS (nao viram predicado). company_id e opt-out sao SEMPRE aplicados.
 */
export function buildAudiencePlan(filter: AudienceFilter | null | undefined): AudiencePlan {
  const f = filter ?? {}
  const plan: AudiencePlan = { companyScoped: true, excludeOptOut: true }

  const statusIn = cleanStrings(f.status)
  if (statusIn) plan.statusIn = statusIn

  const temperatureIn = cleanStrings(f.temperature)
  if (temperatureIn) plan.temperatureIn = temperatureIn

  const tagsOverlap = cleanStrings(f.tags)
  if (tagsOverlap) plan.tagsOverlap = tagsOverlap

  if (typeof f.source_id === 'string' && f.source_id.trim() !== '') {
    plan.sourceEq = f.source_id
  }

  return plan
}
