/**
 * Tool: escalate_to_human
 * Transfere conversa para vendedor humano. Terminal=true.
 * Sandbox: retorna sucesso simulado sem transferir/desativar/trocar instancia.
 */

import { ToolDefinition, ToolResult, ToolContext } from '../tool-registry.ts'

const VALID_REASONS = [
  'lead_qualificado', 'fora_de_escopo', 'lead_solicitou',
  'objecao_complexa', 'pagamento_alto_valor', 'reclamacao',
  'erro_tecnico', 'limite_atingido',
] as const

const VALID_URGENCIES = ['low', 'medium', 'high'] as const

const FALLBACK_TRANSFER_TEMPLATE =
  'Ola! A partir de agora voce sera atendido por {vendedor_nome}. Em breve ele entrara em contato.'

export const escalateToHumanTool: ToolDefinition = {
  name: 'escalate_to_human',

  description:
    'Escale para humano quando: lead esta qualificado e quer falar com vendedor, ' +
    'pergunta sai do seu escopo, lead pede expressamente humano, objecao complexa que voce nao consegue resolver, ' +
    'sinal de reclamacao, ou erro tecnico. ' +
    'summary e um resumo da conversa para o humano se contextualizar rapidamente.',

  parameters: {
    reason: { type: 'string', enum: [...VALID_REASONS], description: 'Motivo da escalada' },
    summary: { type: 'string', minLength: 20, maxLength: 1000, description: 'Resumo da conversa para o humano' },
    recommended_action: { type: 'string', maxLength: 200, description: 'Acao recomendada ao vendedor' },
    urgency: { type: 'string', enum: [...VALID_URGENCIES], description: 'Urgencia da escalada' },
  },
  required: ['reason', 'summary'],

  validate(args: Record<string, unknown>): { ok: boolean; error?: string } {
    if (!VALID_REASONS.includes(args.reason as typeof VALID_REASONS[number])) {
      return { ok: false, error: `reason deve ser: ${VALID_REASONS.join(', ')}` }
    }
    const summary = args.summary as string
    if (typeof summary !== 'string' || summary.length < 20 || summary.length > 1000) {
      return { ok: false, error: 'summary deve ter 20-1000 caracteres' }
    }
    if (args.recommended_action !== undefined) {
      if (typeof args.recommended_action !== 'string' || (args.recommended_action as string).length > 200) {
        return { ok: false, error: 'recommended_action deve ter no maximo 200 caracteres' }
      }
    }
    if (args.urgency !== undefined && !VALID_URGENCIES.includes(args.urgency as typeof VALID_URGENCIES[number])) {
      return { ok: false, error: `urgency deve ser: ${VALID_URGENCIES.join(', ')}` }
    }
    return { ok: true }
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const reason = args.reason as string
    const summary = args.summary as string

    // Sandbox: retorna simulado sem side effects
    if (ctx.isSandbox) {
      return { ok: true, terminal: true, data: { transferredTo: '(simulado)', reason, sandbox: true } }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const leadId = ctx.lead.id as string
    const companyId = ctx.companyId

    // 1. Buscar lead completo (assigned_to, pipeline_id)
    const { data: leadFull } = await ctx.supabase
      .from('leads')
      .select('assigned_to, pipeline_id, name, phone')
      .eq('id', leadId)
      .single()

    // 2. Resolver vendedor
    let vendorName = 'nosso time'
    let vendorInstance: string | null = null
    let vendorUserId: string | null = null

    if (leadFull?.assigned_to) {
      const { data: vendedor } = await ctx.supabase
        .from('profiles')
        .select('id, name, default_whatsapp_instance, user_id')
        .eq('id', leadFull.assigned_to)
        .single()

      if (vendedor) {
        vendorName = vendedor.name ?? vendorName
        vendorInstance = vendedor.default_whatsapp_instance ?? null
        vendorUserId = vendedor.user_id ?? null
      }
    }

    // 3. Buscar template de transferencia do pipeline
    let transferTemplate = FALLBACK_TRANSFER_TEMPLATE
    if (leadFull?.pipeline_id) {
      const { data: pipeline } = await ctx.supabase
        .from('pipelines')
        .select('sdr_transfer_message_template, sdr_instance_name')
        .eq('id', leadFull.pipeline_id)
        .single()

      if (pipeline?.sdr_transfer_message_template) {
        transferTemplate = pipeline.sdr_transfer_message_template
      }

      // Enviar mensagem de transferencia pelo numero do SDR
      const transferMsg = transferTemplate.replace(/\{vendedor_nome\}/g, vendorName)
      try {
        await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            leadId,
            content: transferMsg,
            messageType: 'text',
            senderType: 'ai',
            instanceName: pipeline?.sdr_instance_name,
          }),
        })
      } catch { /* best-effort */ }
    }

    // 4. Desativar IA, trocar instancia, salvar resumo
    await ctx.supabase.from('leads').update({
      is_ai_active: false,
      transfer_summary: summary,
      ...(vendorInstance ? { whatsapp_instance_name: vendorInstance } : {}),
    }).eq('id', leadId)

    // 5. Notificar vendedor
    if (vendorUserId) {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
        const supabasePublic = createClient(supabaseUrl, supabaseKey)
        await supabasePublic.from('notifications').insert({
          company_id: companyId,
          user_id: vendorUserId,
          type: 'lead_transferred',
          title: `Lead ${leadFull?.name ?? leadFull?.phone ?? 'desconhecido'} transferido do SDR IA`,
          body: `Resumo: ${summary}`,
          action_type: 'navigate',
          action_data: { path: `/inbox?lead=${leadId}`, lead_id: leadId, summary },
        })
      } catch { /* best-effort */ }
    }

    return { ok: true, terminal: true, data: { transferredTo: vendorName, reason } }
  },
}
