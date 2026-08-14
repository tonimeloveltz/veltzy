import { veltzy } from '@/lib/supabase'
import type { PipelineStage } from '@/types/database'

export const getPipelineStages = async (companyId: string, pipelineId: string): Promise<PipelineStage[]> => {
  const { data, error } = await veltzy()
    .from('pipeline_stages')
    .select('*')
    .eq('company_id', companyId)
    .eq('pipeline_id', pipelineId)
    .order('position')
  if (error) throw error
  return data
}

export const getAllPipelineStages = async (companyId: string): Promise<PipelineStage[]> => {
  const { data, error } = await veltzy()
    .from('pipeline_stages')
    .select('*')
    .eq('company_id', companyId)
    .order('position')
  if (error) throw error
  return data
}

export const createStage = async (
  companyId: string,
  pipelineId: string,
  input: { name: string; slug: string; color: string; position: number }
): Promise<PipelineStage> => {
  const { data, error } = await veltzy()
    .from('pipeline_stages')
    .insert({ ...input, company_id: companyId, pipeline_id: pipelineId })
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateStage = async (
  companyId: string,
  stageId: string,
  input: Partial<Pick<PipelineStage, 'name' | 'color' | 'position' | 'is_final' | 'is_positive'>>
): Promise<PipelineStage> => {
  const { data, error } = await veltzy()
    .from('pipeline_stages')
    .update(input)
    .eq('id', stageId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteStage = async (companyId: string, stageId: string): Promise<void> => {
  // A etapa e do negocio: contar `deals`, nao `leads`.
  const { count } = await veltzy()
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', stageId)
    .eq('company_id', companyId)

  if (count && count > 0) {
    throw new Error(`Mova os ${count} negócios deste stage antes de deletá-lo`)
  }

  const { error } = await veltzy()
    .from('pipeline_stages')
    .delete()
    .eq('id', stageId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const reorderStages = async (companyId: string, stages: { id: string; position: number }[]): Promise<void> => {
  const updates = stages.map((s) =>
    veltzy()
      .from('pipeline_stages')
      .update({ position: s.position })
      .eq('id', s.id)
      .eq('company_id', companyId)
  )
  const results = await Promise.all(updates)
  const error = results.find((r: { error: unknown }) => r.error)?.error
  if (error) throw error
}
