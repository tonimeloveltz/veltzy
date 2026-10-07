import { supabase } from '@/lib/supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance-manage`

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.session?.access_token}`,
  }
}

// ---------------------------------------------------------------------------
// LEITURA — direto do banco (RLS por company_id)
// ---------------------------------------------------------------------------

export async function listInstances(companyId: string) {
  const { data } = await supabase
    .from('evolution_instances')
    .select('instance_name, display_name, phone_number, status, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  return data ?? []
}

// Sessoes WAHA da empresa (espelha listInstances do Evolution). waha_instances
// vive no schema PUBLIC e a RLS e company-scoped, entao o read direto funciona.
export async function listWahaInstances(companyId: string) {
  const { data } = await supabase
    .from('waha_instances')
    .select('session_name, display_name, phone_number, status, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getInstanceStatus(instanceName: string): Promise<string | null> {
  const { data } = await supabase
    .from('evolution_instances')
    .select('status')
    .eq('instance_name', instanceName)
    .single()
  return data?.status ?? null
}

// ---------------------------------------------------------------------------
// ESCRITA — via Edge Function intermediaria
// ---------------------------------------------------------------------------

export async function createInstance(displayName?: string) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ display_name: displayName || undefined }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Erro ao criar instancia')
  }
  return res.json() as Promise<{
    instance_name: string
    qr_code_base64: string | null
    status: string
  }>
}

export async function fetchQrCode(instanceName: string) {
  const res = await fetch(`${FUNCTION_URL}?instance_name=${instanceName}`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Erro ao buscar QR')
  }
  return res.json() as Promise<{
    qr_code_base64: string | null
    status: string
  }>
}

export async function disconnectInstance(instanceName: string) {
  const res = await fetch(FUNCTION_URL, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ instance_name: instanceName, action: 'disconnect' }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Erro ao desconectar')
  }
  return res.json() as Promise<{ success: boolean; status: string }>
}

export async function reconnectInstance(instanceName: string) {
  const res = await fetch(FUNCTION_URL, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ instance_name: instanceName, action: 'reconnect' }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Erro ao reconectar')
  }
  return res.json() as Promise<{
    success: boolean
    status: string
    qr_code_base64: string | null
  }>
}

export async function deleteInstance(instanceName: string) {
  const res = await fetch(FUNCTION_URL, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ instance_name: instanceName }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Erro ao deletar')
  }
  return res.json() as Promise<{ success: boolean }>
}
