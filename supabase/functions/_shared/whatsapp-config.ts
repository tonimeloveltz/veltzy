import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { WhatsAppConfig, WhatsAppProviderType } from './whatsapp-provider.ts'

/**
 * Retorna o provider ativo da empresa: 'zapi' | 'evolution' | 'cloud_api'
 */
export async function getActiveProvider(
  supabase: SupabaseClient,
  companyId: string,
): Promise<'zapi' | 'evolution' | 'cloud_api'> {
  const { data } = await supabase
    .from('companies')
    .select('active_whatsapp_provider')
    .eq('id', companyId)
    .single()

  const provider = (data?.active_whatsapp_provider as string) ?? 'zapi'
  if (provider !== 'zapi' && provider !== 'evolution' && provider !== 'cloud_api') {
    console.warn(`[getActiveProvider] Valor inesperado para active_whatsapp_provider: '${provider}' (company_id=${companyId}). Fallback para 'zapi'.`)
    return 'zapi'
  }
  return provider
}

function mapRow(row: {
  id: string
  company_id: string
  provider: string
  status: string
  metadata: Record<string, unknown>
}): WhatsAppConfig {
  const m = row.metadata ?? {}
  return {
    id: row.id,
    company_id: row.company_id,
    provider: row.provider as WhatsAppProviderType,
    status: row.status,
    phone_number: (m.phone_number as string) ?? null,
    qr_code: (m.qr_code as string) ?? null,
    connected_at: (m.connected_at as string) ?? null,
    metadata: m,
  }
}

export async function getWhatsAppConfig(
  supabase: SupabaseClient,
  companyId: string,
  extraFilters?: { status?: string },
): Promise<WhatsAppConfig | null> {
  const { data: company } = await supabase
    .from('companies')
    .select('active_whatsapp_provider')
    .eq('id', companyId)
    .single()

  const provider = (company?.active_whatsapp_provider as string) ?? 'zapi'

  let query = supabase
    .from('oauth_integrations')
    .select('id, company_id, provider, status, metadata')
    .eq('company_id', companyId)
    .eq('provider', provider)

  if (extraFilters?.status) {
    query = query.eq('status', extraFilters.status)
  }

  const { data } = await query.maybeSingle()
  if (!data) return null

  return mapRow(data)
}

export async function getWhatsAppConfigByInstanceId(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<WhatsAppConfig | null> {
  const { data } = await supabase
    .from('oauth_integrations')
    .select('id, company_id, provider, status, metadata')
    .eq('metadata->>instance_id', instanceId)
    .maybeSingle()

  if (!data) return null
  return mapRow(data)
}

export async function getAllConnectedConfigs(
  supabase: SupabaseClient,
): Promise<WhatsAppConfig[]> {
  const { data } = await supabase
    .from('oauth_integrations')
    .select('id, company_id, provider, status, metadata')
    .in('provider', ['zapi', 'evolution'])
    .eq('status', 'connected')

  if (!data) return []
  return data.map(mapRow)
}

export async function updateWhatsAppMetadata(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<Pick<WhatsAppConfig, 'status' | 'phone_number' | 'qr_code' | 'connected_at'>>,
): Promise<void> {
  const { data: current } = await supabase
    .from('oauth_integrations')
    .select('metadata, status')
    .eq('id', id)
    .single()

  if (!current) return

  const newMetadata = { ...current.metadata }
  if (updates.phone_number !== undefined) newMetadata.phone_number = updates.phone_number
  if (updates.qr_code !== undefined) newMetadata.qr_code = updates.qr_code
  if (updates.connected_at !== undefined) newMetadata.connected_at = updates.connected_at

  const updatePayload: Record<string, unknown> = { metadata: newMetadata }
  if (updates.status !== undefined) updatePayload.status = updates.status

  await supabase
    .from('oauth_integrations')
    .update(updatePayload)
    .eq('id', id)
}
