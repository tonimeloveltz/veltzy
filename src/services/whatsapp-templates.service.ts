import { supabase, veltzy } from '@/lib/supabase'
import type { WhatsAppTemplate } from '@/types/whatsapp-template'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloud-api-templates`

export interface SyncTemplatesResult {
  success: boolean
  count: number
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.session?.access_token}`,
  }
}

/** Le o catalogo local (veltzy.whatsapp_templates) da empresa. RLS isola por company. */
export async function listTemplates(companyId: string): Promise<WhatsAppTemplate[]> {
  const { data, error } = await veltzy()
    .from('whatsapp_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as WhatsAppTemplate[]
}

/**
 * Sincroniza o catalogo com a Meta via edge intermediaria do Veltzy. O token da
 * WABA nunca chega ao front: o proxy resolve o waba_id e delega ao Hub, depois
 * faz upsert em veltzy.whatsapp_templates.
 */
export async function syncTemplatesFromMeta(): Promise<SyncTemplatesResult> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'list' }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Nao foi possivel sincronizar os templates.')
  }

  return res.json() as Promise<SyncTemplatesResult>
}
