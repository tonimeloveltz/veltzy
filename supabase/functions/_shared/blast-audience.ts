// Traducao do audience_filter da campanha (mkt-ativo) em um "plano" aplicavel na
// query de veltzy.leads. Logica PURA e testavel: valida/normaliza o filtro e diz
// QUAIS predicados aplicar; a edge aplica o plano no query builder do Supabase.
//
// Fase 1: filtros diretos do lead que EXISTEM na tabela (temperature, tags, source_id).
// ⚠️ `status` do lead (new|qualifying|open|deal|lost) NAO e coluna de veltzy.leads —
// o status comercial vive em veltzy.deals (migracao de multiplos pipelines). Logo
// `status` (assim como pipeline/stage) fica pra Fase 2 via join com deals — filtrar
// por ele aqui quebraria a query (coluna inexistente).

export interface AudienceFilter {
  temperature?: string[]
  tags?: string[]
  source_id?: string
  // status / pipeline_id / stage_id: Fase 2 (vivem/dependem de veltzy.deals) — ignorados.
  [key: string]: unknown
}

export interface AudiencePlan {
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

  const temperatureIn = cleanStrings(f.temperature)
  if (temperatureIn) plan.temperatureIn = temperatureIn

  const tagsOverlap = cleanStrings(f.tags)
  if (tagsOverlap) plan.tagsOverlap = tagsOverlap

  if (typeof f.source_id === 'string' && f.source_id.trim() !== '') {
    plan.sourceEq = f.source_id
  }

  return plan
}
