import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ResolveContext {
  leadId: string
  companyId: string
  userId?: string
  pipelineId?: string
  mode: 'human' | 'sdr' | 'automation'
}

/**
 * Resolve qual instance_name usar para enviar mensagem.
 *
 * Prioridade:
 * 1. lead.whatsapp_instance_name (responde pelo mesmo numero que recebeu)
 * 2. Para SDR: pipeline.sdr_instance_name
 * 3. profile.default_whatsapp_instance do vendedor
 * 4. null (erro: vendedor sem numero)
 */
export async function resolveInstanceName(
  supabaseVeltzy: SupabaseClient,
  supabasePublic: SupabaseClient,
  ctx: ResolveContext,
): Promise<string | null> {
  // 1. Instancia do lead (responde pelo numero que recebeu)
  const { data: lead } = await supabaseVeltzy
    .from('leads')
    .select('whatsapp_instance_name, assigned_to')
    .eq('id', ctx.leadId)
    .single()

  if (lead?.whatsapp_instance_name) {
    return lead.whatsapp_instance_name
  }

  // 2. SDR mode: usa instancia do pipeline.
  // Sem fallback para o contato: a coluna saiu de `leads` na Onda 4, e o
  // fallback ja era redundante. Quem chama em modo 'sdr' passa `pipelineId`
  // explicito, e este ramo so roda depois de um inbound, que carimba
  // `whatsapp_instance_name` e resolve na prioridade 1, antes de chegar aqui.
  if (ctx.mode === 'sdr') {
    const pipelineId = ctx.pipelineId
    if (pipelineId) {
      const { data: pipeline } = await supabaseVeltzy
        .from('pipelines')
        .select('sdr_instance_name')
        .eq('id', pipelineId)
        .single()

      if (pipeline?.sdr_instance_name) {
        return pipeline.sdr_instance_name
      }
    }
  }

  // 3. Instancia do perfil do vendedor (humano ou fallback do SDR)
  const profileId = ctx.userId ?? lead?.assigned_to
  if (profileId) {
    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('default_whatsapp_instance')
      .eq('id', profileId)
      .single()

    if (profile?.default_whatsapp_instance) {
      return profile.default_whatsapp_instance
    }
  }

  return null
}
