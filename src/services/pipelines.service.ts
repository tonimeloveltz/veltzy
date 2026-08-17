import { veltzy } from '@/lib/supabase'
import type { Pipeline } from '@/types/database'

export const getPipelines = async (companyId: string): Promise<Pipeline[]> => {
  const { data, error } = await veltzy()
    .from('pipelines')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('position')
  if (error) throw error
  return data
}

export const getDefaultPipeline = async (companyId: string): Promise<Pipeline> => {
  const { data, error } = await veltzy()
    .from('pipelines')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('is_default', true)
    .single()

  if (!error && data) return data

  const { data: fallback, error: fallbackError } = await veltzy()
    .from('pipelines')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('position')
    .limit(1)
    .single()
  if (fallbackError) throw fallbackError
  return fallback
}

export const createPipeline = async (
  companyId: string,
  input: { name: string; slug: string; color: string }
): Promise<Pipeline> => {
  const { data: existing } = await veltzy()
    .from('pipelines')
    .select('position')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const position = (existing?.position ?? -1) + 1

  const { data, error } = await veltzy()
    .from('pipelines')
    .insert({ ...input, company_id: companyId, position })
    .select()
    .single()
  if (error) throw error

  const defaultStages = [
    { name: 'Novo Lead',        slug: 'novo-lead',        position: 0, color: '#3B82F6', is_final: false, is_positive: null },
    { name: 'Qualificando',     slug: 'qualificando',     position: 1, color: '#F59E0B', is_final: false, is_positive: null },
    { name: 'Em Negociacao',    slug: 'em-negociacao',    position: 2, color: '#8B5CF6', is_final: false, is_positive: null },
    { name: 'Proposta Enviada', slug: 'proposta-enviada', position: 3, color: '#06B6D4', is_final: false, is_positive: null },
    { name: 'Fechado (Ganho)',  slug: 'fechado-ganho',    position: 4, color: '#22C55E', is_final: true,  is_positive: true },
    { name: 'Perdido',          slug: 'perdido',          position: 5, color: '#EF4444', is_final: true,  is_positive: false },
  ]

  const { error: stagesError } = await veltzy()
    .from('pipeline_stages')
    .insert(defaultStages.map((s) => ({ ...s, company_id: companyId, pipeline_id: data.id })))
  if (stagesError) throw stagesError

  return data
}

export const updatePipeline = async (
  companyId: string,
  pipelineId: string,
  input: Partial<Pick<Pipeline, 'name' | 'slug' | 'color' | 'is_default' | 'is_active' | 'sdr_instance_name' | 'sdr_transfer_message_template'>>
): Promise<Pipeline> => {
  const { data, error } = await veltzy()
    .from('pipelines')
    .update(input)
    .eq('id', pipelineId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deletePipeline = async (companyId: string, pipelineId: string): Promise<void> => {
  const { data: active } = await veltzy()
    .from('pipelines')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (!active || active.length <= 1) {
    throw new Error('Nao e possivel desativar o unico pipeline ativo')
  }

  // O pipeline e do negocio: contar `deals`, nao `leads`. O `.eq('company_id')`
  // faltava aqui, o que viola a regra de ouro do CLAUDE.md: o RLS e a ultima
  // linha de defesa, nao a unica.
  const { count } = await veltzy()
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('pipeline_id', pipelineId)

  if (count && count > 0) {
    throw new Error('Mova os negócios para outro pipeline antes de desativar')
  }

  const { error } = await veltzy()
    .from('pipelines')
    .update({ is_active: false })
    .eq('id', pipelineId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const reorderPipelines = async (
  companyId: string,
  items: { id: string; position: number }[]
): Promise<void> => {
  const updates = items.map((p) =>
    veltzy()
      .from('pipelines')
      .update({ position: p.position })
      .eq('id', p.id)
      .eq('company_id', companyId)
  )
  const results = await Promise.all(updates)
  const error = results.find((r: { error: unknown }) => r.error)?.error
  if (error) throw error
}

export const setDefaultPipeline = async (companyId: string, pipelineId: string): Promise<void> => {
  const { error } = await veltzy()
    .from('pipelines')
    .update({ is_default: true })
    .eq('id', pipelineId)
    .eq('company_id', companyId)
  if (error) throw error
}
