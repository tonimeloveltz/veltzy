import { supabase } from '@/lib/supabase'

const NUMBERS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-numbers-list`
const MANAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance-manage`

export type WhatsAppProviderKind = 'cloud_api' | 'evolution' | 'waha'
export type WhatsAppNumberStatus = 'connected' | 'disconnected' | 'qr_pending' | 'pending' | 'error'

export interface WhatsAppNumberItem {
  provider: WhatsAppProviderKind
  providerLabel: string
  displayNumber: string | null
  status: WhatsAppNumberStatus
  /** session_name (waha) | instance_name (evolution) | phone_number_id (cloud_api) */
  ref: string
  /** nome do funil roteado por Origem->instancia; null = vai pro padrao */
  funnelName: string | null
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.session?.access_token}`,
  }
}

/** Lista unificada dos numeros dos 3 providers (agregador service_role, filtra company). */
export async function listWhatsAppNumbers(): Promise<WhatsAppNumberItem[]> {
  const res = await fetch(NUMBERS_URL, { method: 'GET', headers: await getAuthHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Erro ao carregar numeros de WhatsApp')
  }
  const body = await res.json() as { numbers: WhatsAppNumberItem[] }
  return body.numbers ?? []
}

/** Desconecta um numero por provider (Evolution/WAHA). Cloud API nao usa este fluxo. */
export async function disconnectNumber(provider: WhatsAppProviderKind, ref: string): Promise<void> {
  const idField = provider === 'waha' ? 'session_name' : 'instance_name'
  const res = await fetch(MANAGE_URL, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ provider, action: 'disconnect', [idField]: ref }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Erro ao desconectar numero')
  }
}
