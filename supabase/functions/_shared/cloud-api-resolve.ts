import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Resolucao de tenant para a Meta Cloud API.
 *
 * Diferente do Evolution (que recebe company_id do Hub), a Cloud API nao manda
 * company_id. Resolvemos a empresa a partir de value.metadata.phone_number_id
 * via veltzy.cloud_api_numbers.
 */

export interface ResolvedNumber {
  id: string                  // uuid de cloud_api_numbers (carimba leads.cloud_api_number_id — V2 multi-numero)
  companyId: string
  instanceLabel: string       // instance_label ?? phone_number_id (vai para *.instance_name)
  accessToken: string | null  // token do numero p/ baixar midia / outbound futuro
  status: 'active' | 'offboarded'
}

/**
 * Resolve a empresa pelo phone_number_id. Retorna null se o numero nao esta
 * cadastrado — nesse caso a mensagem e ignorada (responder 200, admin cadastra
 * o numero via Embedded Signup).
 */
export async function resolveCloudApiNumber(
  // Client com { db: { schema: 'veltzy' } }. Schema generico ('veltzy' difere de
  // 'public'), entao aceitamos qualquer schema para nao colidir com o tipo default.
  // deno-lint-ignore no-explicit-any
  supabaseVeltzy: SupabaseClient<any, any, any>,
  phoneNumberId: string,
): Promise<ResolvedNumber | null> {
  const { data } = await supabaseVeltzy
    .from('cloud_api_numbers')
    .select('id, company_id, instance_label, phone_number_id, access_token, status')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    companyId: data.company_id,
    instanceLabel: data.instance_label ?? data.phone_number_id,
    accessToken: data.access_token,
    status: data.status,
  }
}

// --- Resolucao de numero para outbound ---

export interface OutboundNumber {
  phoneNumberId: string
  instanceLabel: string        // vai para messages.instance_name (auditoria multi-instancia)
}

/**
 * Resolve qual numero Cloud API usar para enviar.
 *  1. lead.cloud_api_number_id (responde pelo numero onde o lead falou)
 *  2. numero default da empresa (status='active' AND is_default=true)
 *  3. null -> erro de configuracao (whatsapp-send nao envia)
 */
export async function resolveOutboundCloudApiNumber(
  // deno-lint-ignore no-explicit-any
  supabaseVeltzy: SupabaseClient<any, any, any>,
  lead: { cloud_api_number_id: string | null; company_id: string },
): Promise<OutboundNumber | null> {
  // 1. Vinculo do lead
  if (lead.cloud_api_number_id) {
    const { data } = await supabaseVeltzy
      .from('cloud_api_numbers')
      .select('phone_number_id, instance_label, status')
      .eq('id', lead.cloud_api_number_id)
      .maybeSingle()
    if (data && data.status === 'active') {
      return {
        phoneNumberId: data.phone_number_id,
        instanceLabel: data.instance_label ?? data.phone_number_id,
      }
    }
  }

  // 2. Default da empresa
  const { data: def } = await supabaseVeltzy
    .from('cloud_api_numbers')
    .select('phone_number_id, instance_label')
    .eq('company_id', lead.company_id)
    .eq('status', 'active')
    .eq('is_default', true)
    .maybeSingle()
  if (def) {
    return {
      phoneNumberId: def.phone_number_id,
      instanceLabel: def.instance_label ?? def.phone_number_id,
    }
  }

  // 3. Sem vinculo e sem default
  return null
}
