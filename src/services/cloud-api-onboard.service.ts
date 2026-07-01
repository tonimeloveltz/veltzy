import { supabase } from '@/lib/supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloud-api-onboard-proxy`

export interface OnboardPayload {
  code: string
  phoneNumberId: string
  wabaId: string
  displayNumber?: string
}

export interface OnboardResult {
  success: boolean
  phone_number_id: string
}

/** Numero ja conectado (phone_number_id UNIQUE). Tratado com copy neutra na UI. */
export class NumberConflictError extends Error {}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.session?.access_token}`,
  }
}

/**
 * Dispara o onboarding via edge intermediaria do Veltzy. O Veltzy nunca recebe
 * nem armazena token: so envia code + IDs; o Hub troca e guarda o token.
 */
export async function onboardCloudApiNumber(payload: OnboardPayload): Promise<OnboardResult> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      code: payload.code,
      phone_number_id: payload.phoneNumberId,
      waba_id: payload.wabaId,
      display_number: payload.displayNumber,
    }),
  })

  if (res.status === 409) {
    throw new NumberConflictError('Este numero ja esta conectado. Fale com o suporte.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Nao foi possivel conectar o numero.')
  }

  return res.json() as Promise<OnboardResult>
}
