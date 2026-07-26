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
