import { veltzy } from '@/lib/supabase'
import type { SourceIntegration, IntegrationType, WebhookPreset, WebhookIntegrationWithDetails, WebhookInboundLog } from '@/types/database'

export const getIntegrations = async (companyId: string): Promise<SourceIntegration[]> => {
  const { data, error } = await veltzy()
    .from('source_integrations')
    .select('*')
    .eq('company_id', companyId)
  if (error) throw error
  return data
}

export const saveIntegration = async (
  companyId: string,
  sourceId: string,
  type: IntegrationType,
  config: Record<string, unknown>
): Promise<SourceIntegration> => {
  const { data, error } = await veltzy()
    .from('source_integrations')
    .upsert(
      { company_id: companyId, source_id: sourceId, integration_type: type, config },
      { onConflict: 'company_id,source_id,integration_type' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteIntegration = async (companyId: string, id: string): Promise<void> => {
  const { error } = await veltzy().from('source_integrations').delete().eq('id', id).eq('company_id', companyId)
  if (error) throw error
}

// --- Webhook-specific methods ---

export const getWebhookIntegrations = async (companyId: string): Promise<WebhookIntegrationWithDetails[]> => {
  const { data: integrations, error } = await veltzy()
    .from('source_integrations')
    .select('*')
    .eq('company_id', companyId)
    .eq('integration_type', 'webhook')
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!integrations || integrations.length === 0) return []

  // Buscar lead_sources e pipeline_sources para enriquecer
  const sourceIds = [...new Set(integrations.map((i) => i.source_id))]
  const { data: sources } = await veltzy()
    .from('lead_sources')
    .select('id, name, slug')
    .in('id', sourceIds)

  const { data: pipelineSources } = await veltzy()
    .from('pipeline_sources')
    .select('source_id, pipeline_id')
    .in('source_id', sourceIds)

  const pipelineIds = [...new Set((pipelineSources ?? []).map((ps) => ps.pipeline_id))]
  const { data: pipelines } = pipelineIds.length > 0
    ? await veltzy().from('pipelines').select('id, name').in('id', pipelineIds)
    : { data: [] }

  const sourceMap = new Map((sources ?? []).map((s) => [s.id, s]))
  const pipelineSourceMap = new Map((pipelineSources ?? []).map((ps) => [ps.source_id, ps.pipeline_id]))
  const pipelineMap = new Map((pipelines ?? []).map((p) => [p.id, p]))

  return integrations.map((integration) => {
    const source = sourceMap.get(integration.source_id)
    const pipelineId = pipelineSourceMap.get(integration.source_id) ?? null
    const pipeline = pipelineId ? pipelineMap.get(pipelineId) : null
    return {
      ...integration,
      lead_source_name: source?.name ?? 'Desconhecida',
      lead_source_slug: source?.slug ?? '',
      pipeline_id: pipelineId,
      pipeline_name: pipeline?.name ?? null,
    }
  })
}

export const createWebhookIntegration = async (
  companyId: string,
  sourceId: string,
  pipelineId: string,
  preset: WebhookPreset,
): Promise<SourceIntegration> => {
  const token = crypto.randomUUID()

  // Criar source_integration
  const { data, error } = await veltzy()
    .from('source_integrations')
    .insert({
      company_id: companyId,
      source_id: sourceId,
      integration_type: 'webhook' as IntegrationType,
      config: { preset },
      webhook_token: token,
      is_active: true,
    })
    .select()
    .single()
  if (error) throw error

  // Criar pipeline_sources (mapeamento source -> pipeline)
  const { error: psError } = await veltzy()
    .from('pipeline_sources')
    .upsert(
      { pipeline_id: pipelineId, source_id: sourceId },
      { onConflict: 'pipeline_id,source_id' }
    )
  if (psError) {
    // Rollback: deletar a integracao criada
    await veltzy().from('source_integrations').delete().eq('id', data.id)
    throw psError
  }

  return data
}

export const regenerateWebhookToken = async (
  companyId: string,
  integrationId: string,
): Promise<string> => {
  const newToken = crypto.randomUUID()
  const { error } = await veltzy()
    .from('source_integrations')
    .update({ webhook_token: newToken })
    .eq('id', integrationId)
    .eq('company_id', companyId)
  if (error) throw error
  return newToken
}

export const toggleWebhookIntegration = async (
  companyId: string,
  integrationId: string,
  isActive: boolean,
): Promise<void> => {
  const { error } = await veltzy()
    .from('source_integrations')
    .update({ is_active: isActive })
    .eq('id', integrationId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const deleteWebhookIntegration = async (
  companyId: string,
  integrationId: string,
): Promise<void> => {
  const { error } = await veltzy()
    .from('source_integrations')
    .delete()
    .eq('id', integrationId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const getWebhookLogs = async (
  companyId: string,
  integrationId?: string,
  limit = 20,
): Promise<WebhookInboundLog[]> => {
  let query = veltzy()
    .from('webhook_inbound_log')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (integrationId) {
    query = query.eq('source_integration_id', integrationId)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}
