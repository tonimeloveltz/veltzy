import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ResolveContext {
  leadId: string
  companyId: string
  userId?: string
  pipelineId?: string
  mode: 'human' | 'sdr' | 'automation'
  provider?: 'evolution' | 'waha'
}

export interface CompanyInstance {
  name: string
  status: string | null
}

/**
 * Escolhe o numero de envio a partir dos candidatos em ordem de prioridade.
 *
 * Um candidato so vale se o numero ainda existe na empresa. Numero removido
 * (ex.: WhatsApp reconectado como instancia nova, `x` -> `x-2`) e pulado,
 * senao o envio falha com "Instancia nao encontrada" para sempre nos leads
 * carimbados com o nome antigo. Numero existente mas desconectado continua
 * valendo: troca silenciosa de remetente seria pior que o erro explicito.
 *
 * Sem candidato valido, cai no numero unico conectado da empresa (so quando
 * ha exatamente um). `instances === null` = lista indisponivel: confia no
 * primeiro candidato, como antes.
 */
export function pickInstance(
  candidates: Array<string | null | undefined>,
  instances: CompanyInstance[] | null,
): string | null {
  const present = candidates.filter((c): c is string => !!c)

  if (instances === null) return present[0] ?? null

  const existing = new Set(instances.map((i) => i.name))
  const valid = present.find((c) => existing.has(c))
  if (valid) return valid

  const connected = instances.filter((i) => i.status === 'connected')
  return connected.length === 1 ? connected[0].name : null
}

/** Numeros (instancias Evolution / sessoes WAHA) da empresa, com status. */
export async function listCompanyInstances(
  supabasePublic: SupabaseClient,
  companyId: string,
  provider: 'evolution' | 'waha' | undefined,
): Promise<CompanyInstance[] | null> {
  if (provider === 'waha') {
    const { data, error } = await supabasePublic
      .from('waha_instances')
      .select('session_name, status')
      .eq('company_id', companyId)
    if (error || !data) return null
    return data.map((r: { session_name: string; status: string | null }) => ({ name: r.session_name, status: r.status }))
  }
  if (provider === 'evolution') {
    const { data, error } = await supabasePublic
      .from('evolution_instances')
      .select('instance_name, status')
      .eq('company_id', companyId)
    if (error || !data) return null
    return data.map((r: { instance_name: string; status: string | null }) => ({ name: r.instance_name, status: r.status }))
  }
  return null
}

/**
 * Resolve qual instance_name usar para enviar mensagem.
 *
 * Prioridade (cada candidato so vale se o numero ainda existe na empresa):
 * 1. lead.whatsapp_instance_name (responde pelo mesmo numero que recebeu)
 * 2. Para SDR: pipeline.sdr_instance_name
 * 3. profile.default_whatsapp_instance do vendedor
 * 4. Fallback: numero unico conectado da empresa (so quando ha exatamente um),
 *    pra empresas de numero unico funcionarem sem o cliente configurar nada.
 * 5. null (erro: empresa sem numero ou com varios e nenhum default escolhido)
 */
export async function resolveInstanceName(
  supabaseVeltzy: SupabaseClient,
  supabasePublic: SupabaseClient,
  ctx: ResolveContext,
): Promise<string | null> {
  const candidates: Array<string | null | undefined> = []

  // 1. Instancia do lead (responde pelo numero que recebeu)
  const { data: lead } = await supabaseVeltzy
    .from('leads')
    .select('whatsapp_instance_name, assigned_to')
    .eq('id', ctx.leadId)
    .single()
  candidates.push(lead?.whatsapp_instance_name)

  // 2. SDR mode: usa instancia do pipeline.
  // Quem chama em modo 'sdr' passa `pipelineId` explicito.
  if (ctx.mode === 'sdr' && ctx.pipelineId) {
    const { data: pipeline } = await supabaseVeltzy
      .from('pipelines')
      .select('sdr_instance_name')
      .eq('id', ctx.pipelineId)
      .single()
    candidates.push(pipeline?.sdr_instance_name)
  }

  // 3. Instancia do perfil do vendedor (humano ou fallback do SDR)
  const profileId = ctx.userId ?? lead?.assigned_to
  if (profileId) {
    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('default_whatsapp_instance')
      .eq('id', profileId)
      .single()
    candidates.push(profile?.default_whatsapp_instance)
  }

  // 4. Validacao contra os numeros da empresa + fallback do numero unico conectado.
  const instances = await listCompanyInstances(supabasePublic, ctx.companyId, ctx.provider)
  return pickInstance(candidates, instances)
}
