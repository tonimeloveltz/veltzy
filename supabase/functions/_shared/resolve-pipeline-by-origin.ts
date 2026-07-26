import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Resolucao central de pipeline por ORIGEM do negocio (feature origem-por-pipeline).
// Fonte unica de decisao: elimina o ponto duplo (createLead + createDealForLead).
// "Mais especifico vence" (RF3): ad_id > campaign_id > utm_campaign > instance > webhook_source.

export type MatchType = 'ad_id' | 'campaign_id' | 'utm_campaign' | 'instance' | 'webhook_source'

/** Regra origem -> pipeline (subset de veltzy.pipeline_routing_rules usado na decisao). */
export interface RoutingRule {
  id: string
  pipeline_id: string
  match_type: MatchType
  match_value: string
  is_active: boolean
}

/** Identificadores de origem coletados do inbound (so os disponiveis vem preenchidos). */
export interface OriginIdentifiers {
  adId?: string | null // ad_context.ad_id (WhatsApp) ou ad_id (webhook)
  campaignId?: string | null // webhook (Lead Ads / Google)
  utmCampaign?: string | null // webhook (UTM)
  instanceName?: string | null // instancia WhatsApp
  sourceId?: string | null // lead_source.id (slug 'whatsapp' ou origem do webhook)
}

export interface ResolvedPipeline {
  pipelineId: string | null // null so se a empresa nao tiver NENHUM pipeline ativo
  ruleId: string | null // regra que decidiu; null se caiu no fallback default
  matchType: MatchType | 'default'
}

/** Peso de especificidade: mais especifico vence. So no codigo, nunca no banco. */
export const WEIGHT: Record<MatchType, number> = {
  ad_id: 40,
  campaign_id: 35,
  utm_campaign: 30,
  instance: 20,
  webhook_source: 10,
}

/** Candidatos (match_type, match_value) a partir dos identificadores nao-nulos. */
function buildCandidates(ids: OriginIdentifiers): Array<{ type: MatchType; value: string }> {
  const out: Array<{ type: MatchType; value: string }> = []
  if (ids.adId) out.push({ type: 'ad_id', value: ids.adId })
  if (ids.campaignId) out.push({ type: 'campaign_id', value: ids.campaignId })
  if (ids.utmCampaign) out.push({ type: 'utm_campaign', value: ids.utmCampaign })
  if (ids.instanceName) out.push({ type: 'instance', value: ids.instanceName })
  if (ids.sourceId) out.push({ type: 'webhook_source', value: ids.sourceId })
  return out
}

/**
 * Funcao PURA: dado o conjunto de regras e os identificadores, escolhe a regra
 * vencedora pela precedencia (peso desc). Retorna null se nenhuma casar.
 * Testavel sem I/O (sem supabase): coracao da precedencia.
 */
export function pickByWeight(rules: RoutingRule[], ids: OriginIdentifiers): RoutingRule | null {
  const candidates = buildCandidates(ids)
  if (candidates.length === 0) return null

  const matched = rules.filter(
    (r) =>
      r.is_active &&
      candidates.some((c) => c.type === r.match_type && c.value === r.match_value),
  )
  if (matched.length === 0) return null

  matched.sort((a, b) => WEIGHT[b.match_type] - WEIGHT[a.match_type])
  return matched[0]
}

/** Fallback: pipeline is_default ativo -> senao 1o ativo por position/created_at. */
async function resolveDefaultPipeline(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data: def } = await supabase
    .from('pipelines')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle()
  if (def?.id) return def.id

  const { data: first } = await supabase
    .from('pipelines')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('position')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  return first?.id ?? null
}

/**
 * Resolve o pipeline destino de um negocio a partir da sua origem.
 * Uma unica query (todas as regras ativas da empresa), casa/ordena em memoria
 * via pickByWeight: evita o risco do PostgREST .or() com virgula/parenteses em UTMs.
 */
export async function resolvePipelineByOrigin(
  supabase: SupabaseClient,
  companyId: string,
  ids: OriginIdentifiers,
): Promise<ResolvedPipeline> {
  const { data: rules, error } = await supabase
    .from('pipeline_routing_rules')
    .select('id, pipeline_id, match_type, match_value, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (error) {
    console.error('[resolve-pipeline] Error fetching routing rules:', JSON.stringify(error))
  }

  const winner = pickByWeight((rules ?? []) as RoutingRule[], ids)
  if (winner) {
    return { pipelineId: winner.pipeline_id, ruleId: winner.id, matchType: winner.match_type }
  }

  const pipelineId = await resolveDefaultPipeline(supabase, companyId)
  return { pipelineId, ruleId: null, matchType: 'default' }
}
