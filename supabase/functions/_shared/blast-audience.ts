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
  // Segmentação por ETAPA: stage_id do deal ABERTO mais recente (vive em veltzy.deals).
  // A resolução (DISTINCT ON lead_id … status='open' ORDER created_at DESC) é na edge;
  // aqui só normaliza a lista de stages desejados.
  stage_id?: string[]
  // status / pipeline_id: por-pipeline = evolução futura.
  [key: string]: unknown
}

export interface AudiencePlan {
  temperatureIn?: string[]
  tagsOverlap?: string[] // lead.tags && filtro (qualquer tag em comum)
  sourceEq?: string
  stageIn?: string[]     // filtra pelo stage do deal aberto recente (resolvido na edge via deals)
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

  const stageIn = cleanStrings(f.stage_id)
  if (stageIn) plan.stageIn = stageIn

  return plan
}

/**
 * Critério A ESTRITO da segmentação por etapa: retorna os lead_ids cujo deal ABERTO
 * MAIS RECENTE (maior created_at) está em stageIds. Espelha o run-automations (que
 * age no deal aberto mais recente). O caller passa SÓ deals status='open'.
 */
export function leadIdsInStages(
  deals: { lead_id: string; stage_id: string | null; created_at: string }[],
  stageIds: string[],
): string[] {
  const latestByLead = new Map<string, { stage_id: string | null; created_at: string }>()
  for (const d of deals) {
    const cur = latestByLead.get(d.lead_id)
    if (!cur || d.created_at > cur.created_at) {
      latestByLead.set(d.lead_id, { stage_id: d.stage_id, created_at: d.created_at })
    }
  }
  const wanted = new Set(stageIds)
  const out: string[] = []
  for (const [leadId, v] of latestByLead) {
    if (v.stage_id && wanted.has(v.stage_id)) out.push(leadId)
  }
  return out
}
