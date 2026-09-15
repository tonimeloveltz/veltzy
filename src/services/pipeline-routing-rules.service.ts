import { veltzy as db } from '@/lib/supabase'
import type { PipelineRoutingRule, RoutingMatchType } from '@/types/database'

/** Regras origem -> pipeline da empresa (feature origem-por-pipeline). */
export const listRoutingRules = async (
  companyId: string,
  pipelineId?: string,
): Promise<PipelineRoutingRule[]> => {
  let query = db()
    .from('pipeline_routing_rules')
    .select('*')
    .eq('company_id', companyId)
  if (pipelineId) query = query.eq('pipeline_id', pipelineId)
  const { data, error } = await query.order('created_at')
  if (error) throw error
  return data
}

/** Regra da empresa para uma origem (match_type+match_value), com o nome do funil dono.
 *  A unicidade e por empresa+origem, entao no maximo uma regra casa. Usado para detectar
 *  conflito ao adicionar (a mesma origem ja roteia para outro funil). */
export interface RoutingRuleOrigin {
  id: string
  pipeline_id: string
  pipelineName: string
}

export const getRoutingRuleByOrigin = async (
  companyId: string,
  matchType: RoutingMatchType,
  matchValue: string,
): Promise<RoutingRuleOrigin | null> => {
  const { data, error } = await db()
    .from('pipeline_routing_rules')
    .select('id, pipeline_id, pipelines:pipeline_id(name)')
    .eq('company_id', companyId)
    .eq('match_type', matchType)
    .eq('match_value', matchValue)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as Record<string, unknown>
  // Embed to-one: o PostgREST tipa como array, mas em runtime vem objeto (FK unica).
  // Normaliza os dois formatos para pegar o nome do funil.
  const embed = row.pipelines as { name: string } | { name: string }[] | null
  const pipeline = Array.isArray(embed) ? embed[0] : embed
  return {
    id: row.id as string,
    pipeline_id: row.pipeline_id as string,
    pipelineName: pipeline?.name ?? '',
  }
}

/** Move uma regra existente para outro funil (reatribuicao). Reativa a regra
 *  (is_active=true) para o caso de ela estar desligada no funil de origem. */
export const reassignRoutingRule = async (
  companyId: string,
  id: string,
  pipelineId: string,
): Promise<void> => {
  const { error } = await db()
    .from('pipeline_routing_rules')
    .update({ pipeline_id: pipelineId, is_active: true })
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw error
}

export const createRoutingRule = async (
  companyId: string,
  input: { pipelineId: string; matchType: RoutingMatchType; matchValue: string },
): Promise<PipelineRoutingRule> => {
  const { data, error } = await db()
    .from('pipeline_routing_rules')
    .insert({
      company_id: companyId,
      pipeline_id: input.pipelineId,
      match_type: input.matchType,
      match_value: input.matchValue,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateRoutingRule = async (
  companyId: string,
  id: string,
  patch: { matchValue?: string; isActive?: boolean },
): Promise<void> => {
  const update: Record<string, unknown> = {}
  if (patch.matchValue !== undefined) update.match_value = patch.matchValue
  if (patch.isActive !== undefined) update.is_active = patch.isActive
  const { error } = await db()
    .from('pipeline_routing_rules')
    .update(update)
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw error
}

export const deleteRoutingRule = async (companyId: string, id: string): Promise<void> => {
  const { error } = await db()
    .from('pipeline_routing_rules')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw error
}
