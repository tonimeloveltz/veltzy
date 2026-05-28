/**
 * sdr-engine — Entry point do agent harness SDR AI v2.
 * Recebe mensagem do lead (via lead-inbound-handler) e orquestra o agent loop.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubClient } from './hub-client.ts'
import { ToolRegistry } from './tool-registry.ts'
import { BudgetEnforcer } from './budget-enforcer.ts'
import { MemoryManager } from './memory-manager.ts'
import { GuardrailChecker } from './guardrail-checker.ts'
import { ConversationStateManager } from './conversation-state.ts'
import { runAgentLoop } from './agent-loop.ts'
import { qualifyLeadTool } from './tools/qualify-lead.ts'
import { updateLeadFieldTool } from './tools/update-lead-field.ts'
import { escalateToHumanTool } from './tools/escalate-to-human.ts'
import { queryBusinessKnowledgeTool } from './tools/query-business-knowledge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALL_TOOLS = [qualifyLeadTool, updateLeadFieldTool, escalateToHumanTool, queryBusinessKnowledgeTool]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.json()
    const { leadId, companyId, messageContent, pipelineId, instanceName, sandbox } = body

    if (!leadId || !companyId || !messageContent) {
      return jsonResponse({ ok: false, error: 'leadId, companyId e messageContent obrigatorios' }, 400)
    }

    const isSandbox = sandbox === true

    // 1. Carregar lead
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, phone, email, observations, tags, ai_score, temperature, is_ai_active, assigned_to, pipeline_id, whatsapp_instance_name')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return jsonResponse({ ok: false, error: 'Lead nao encontrado' }, 404)
    }

    // Resolver pipeline_id
    const resolvedPipelineId = pipelineId ?? lead.pipeline_id
    if (!resolvedPipelineId) {
      return jsonResponse({ ok: false, error: 'Lead sem pipeline_id' }, 400)
    }

    // 2. Carregar agent_profile
    const { data: agentProfile } = await supabase
      .from('agent_profiles')
      .select('*')
      .eq('pipeline_id', resolvedPipelineId)
      .single()

    if (!agentProfile) {
      return jsonResponse({ ok: false, error: 'Agent Profile nao encontrado para este pipeline' }, 404)
    }

    // 3. Verificar condicoes de roteamento (pula em sandbox)
    if (!isSandbox) {
      if (!agentProfile.is_active) {
        return jsonResponse({ ok: false, error: 'Agent Profile inativo' }, 400)
      }
      if (!lead.is_ai_active) {
        return jsonResponse({ ok: false, error: 'IA desativada para este lead' }, 400)
      }
      if (agentProfile.operating_mode !== 'full_auto') {
        return jsonResponse({ ok: false, error: 'Modo suggest_mode nao implementado nesta onda' }, 400)
      }
    }

    // 4. Inicializar componentes
    const hubClient = new HubClient()
    const conversationState = new ConversationStateManager(supabase)
    const memoryManager = new MemoryManager()
    const guardrailChecker = new GuardrailChecker()
    const budgetEnforcer = new BudgetEnforcer({
      maxTokensPerConversation: agentProfile.max_tokens_per_conversation ?? 50000,
      maxIterationsPerTurn: agentProfile.max_iterations_per_turn ?? 10,
    })

    // 5. Registrar tools habilitadas
    const toolRegistry = new ToolRegistry()
    const enabledTools = (agentProfile.enabled_tools as string[]) ?? []
    for (const tool of ALL_TOOLS) {
      if (enabledTools.includes(tool.name)) {
        toolRegistry.register(tool)
      }
    }

    // Sempre registrar escalate_to_human (necessario para budget exceeded)
    if (!toolRegistry.has('escalate_to_human')) {
      toolRegistry.register(escalateToHumanTool)
    }

    // 6. Obter ou criar conversa
    const conversation = isSandbox
      ? conversationState.createInMemory(leadId, resolvedPipelineId, agentProfile.id, companyId)
      : await conversationState.getOrCreateActive(leadId, resolvedPipelineId, agentProfile.id, companyId)

    // 7. Resolver instancia WhatsApp
    const resolvedInstance = instanceName ?? await resolveInstance(supabase, supabasePublic, resolvedPipelineId, lead)

    // 8. Executar agent loop
    const result = await runAgentLoop({
      supabase,
      hubClient,
      agentProfile,
      conversation,
      lead,
      inboundMessage: messageContent,
      toolRegistry,
      budgetEnforcer,
      memoryManager,
      guardrailChecker,
      conversationState,
      companyId,
      isSandbox,
      instanceName: resolvedInstance,
    })

    return jsonResponse({
      ok: true,
      conversationId: conversation.id,
      result: result.result,
      ...(isSandbox ? {
        responseText: result.responseText,
        toolCalls: result.toolCalls,
        iterations: result.iterations,
        totalTokens: result.totalTokens,
      } : {}),
    })
  } catch (err) {
    console.error('[sdr-engine] Error:', err)
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : 'Erro interno do sdr-engine',
    }, 500)
  }
})

// --- Helpers ---

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function resolveInstance(
  supabase: ReturnType<typeof createClient>,
  supabasePublic: ReturnType<typeof createClient>,
  pipelineId: string,
  lead: Record<string, unknown>,
): Promise<string | null> {
  // Prioridade: pipeline.sdr_instance_name > lead.whatsapp_instance_name > assigned_to profile
  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('sdr_instance_name')
    .eq('id', pipelineId)
    .single()

  if (pipeline?.sdr_instance_name) return pipeline.sdr_instance_name
  if (lead.whatsapp_instance_name) return lead.whatsapp_instance_name as string

  if (lead.assigned_to) {
    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('default_whatsapp_instance')
      .eq('id', lead.assigned_to)
      .single()

    if (profile?.default_whatsapp_instance) return profile.default_whatsapp_instance
  }

  return null
}
