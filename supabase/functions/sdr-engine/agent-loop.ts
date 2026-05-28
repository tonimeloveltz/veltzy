/**
 * AgentLoop — While loop canonico do agent harness.
 * Chama Hub /ai-complete, executa tools, repete ate resposta final ou stop condition.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubClient, HubError } from './hub-client.ts'
import { ToolRegistry, ToolContext } from './tool-registry.ts'
import { BudgetEnforcer, BudgetExceededError } from './budget-enforcer.ts'
import { MemoryManager } from './memory-manager.ts'
import { GuardrailChecker } from './guardrail-checker.ts'
import { ConversationStateManager, ConversationRecord } from './conversation-state.ts'
import { buildSystemPrompt } from './system-prompt-builder.ts'

// --- Types ---

export interface AgentLoopParams {
  supabase: SupabaseClient
  hubClient: HubClient
  agentProfile: Record<string, unknown>
  conversation: ConversationRecord
  lead: Record<string, unknown>
  inboundMessage: string
  toolRegistry: ToolRegistry
  budgetEnforcer: BudgetEnforcer
  memoryManager: MemoryManager
  guardrailChecker: GuardrailChecker
  conversationState: ConversationStateManager
  companyId: string
  isSandbox: boolean
  instanceName: string | null
}

export interface AgentLoopResult {
  result: 'responded' | 'escalated' | 'budget_exceeded' | 'error'
  responseText: string | null
  totalTokens: number
  totalCostUsd: number
  iterations: number
  toolCalls: Array<{ name: string; args: string; result: unknown }>
}

// --- Loop ---

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const {
    supabase, hubClient, agentProfile, lead, inboundMessage,
    toolRegistry, budgetEnforcer, memoryManager, guardrailChecker,
    conversationState, companyId, isSandbox, instanceName,
  } = params
  let conversation = params.conversation

  // Setup
  memoryManager.setSystemPrompt(buildSystemPrompt(agentProfile as Parameters<typeof buildSystemPrompt>[0]))
  await memoryManager.loadHistory(supabase, lead.id as string)
  memoryManager.appendUserMessage(inboundMessage)
  guardrailChecker.resetTurn()
  budgetEnforcer.resetTurn()

  let done = false
  let iterations = 0
  let resultType: AgentLoopResult['result'] = 'responded'
  let responseText: string | null = null
  const allToolCalls: AgentLoopResult['toolCalls'] = []

  const toolCtx: ToolContext = {
    supabase, lead, conversation, agentProfile, companyId, hubClient, isSandbox,
  }

  while (!done) {
    // Budget check
    try {
      budgetEnforcer.assertCanContinue(conversation)
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        resultType = 'budget_exceeded'
        // Enviar mensagem padrao e escalar
        const fallbackMsg = 'Estou indisponivel no momento. Vou te conectar com alguem da equipe.'
        if (!isSandbox) {
          await sendWhatsApp(supabase, lead.id as string, fallbackMsg, instanceName)
          // Escalar via tool
          await toolRegistry.executeWithValidation('budget-escalate', 'escalate_to_human', JSON.stringify({
            reason: 'limite_atingido',
            summary: `Budget excedido: ${err.reason}. Conversa encerrada automaticamente.`,
            urgency: 'medium',
          }), toolCtx)
        }
        responseText = fallbackMsg
        done = true
        break
      }
      throw err
    }

    // Chamar Hub /ai-complete
    let hubResponse
    try {
      const context = memoryManager.buildContext()
      hubResponse = await hubClient.complete({
        company_id: companyId,
        product: 'veltzy',
        feature: 'sdr-engine',
        lead_id: lead.id as string,
        messages: [
          { role: 'system', content: context.systemPrompt },
          ...context.messages,
        ],
        tools: toolRegistry.openAISchema(),
        temperature: 0.3,
      })
    } catch (err) {
      if (err instanceof HubError) {
        if (err.code === 'TENANT_DISABLED' || err.code === 'LIMIT_EXCEEDED') {
          resultType = 'budget_exceeded'
          const fallbackMsg = 'Estou indisponivel no momento. Vou te conectar com alguem da equipe.'
          if (!isSandbox) {
            await sendWhatsApp(supabase, lead.id as string, fallbackMsg, instanceName)
          }
          responseText = fallbackMsg
          done = true
          break
        }
      }
      console.error('[agent-loop] Hub error:', err)
      resultType = 'error'
      done = true
      break
    }

    if (!hubResponse.ok || !hubResponse.data) {
      console.error('[agent-loop] Hub returned error:', hubResponse.error)
      resultType = 'error'
      done = true
      break
    }

    // Atualizar iteracao
    iterations++
    if (!isSandbox) {
      conversation = await conversationState.incrementIteration(conversation.id, hubResponse.data.usage)
      toolCtx.conversation = conversation
    } else {
      conversation = {
        ...conversation,
        current_iteration: conversation.current_iteration + 1,
        total_iterations: conversation.total_iterations + 1,
        total_tokens_used: conversation.total_tokens_used + hubResponse.data.usage.total_tokens,
        total_cost_usd: conversation.total_cost_usd + hubResponse.data.usage.cost_usd,
      }
      toolCtx.conversation = conversation
    }

    const { content, tool_calls } = hubResponse.data

    // Tool calls
    if (tool_calls && tool_calls.length > 0) {
      memoryManager.appendAssistantToolCalls(content, tool_calls)

      for (const tc of tool_calls) {
        budgetEnforcer.consumeToolCall()

        // Track knowledge queries for guardrail
        if (tc.function.name === 'query_business_knowledge') {
          guardrailChecker.markKnowledgeQueried()
        }

        const result = await toolRegistry.executeWithValidation(
          tc.id, tc.function.name, tc.function.arguments, toolCtx,
        )

        allToolCalls.push({ name: tc.function.name, args: tc.function.arguments, result })
        memoryManager.appendToolResult(tc.id, JSON.stringify(result))

        if (result.terminal) {
          done = true
          resultType = tc.function.name === 'escalate_to_human' ? 'escalated' : 'responded'

          // Fechar conversa
          if (!isSandbox) {
            const closeStatus = resultType === 'escalated' ? 'escalated' as const : 'completed' as const
            await conversationState.close(
              conversation.id, closeStatus,
              tc.function.name, JSON.stringify(result.data ?? {}),
            )
          }
          break
        }
      }
    } else {
      // Resposta final ao lead (sem tool calls)
      const text = content ?? ''

      // Guardrail check
      const guardrailResult = guardrailChecker.checkResponse(text, {
        must_escalate_keywords: (agentProfile.must_escalate_keywords as string[]) ?? [],
        forbidden_topics: (agentProfile.forbidden_topics as string[]) ?? [],
      })

      if (guardrailResult.forceEscalate) {
        // Forcar escalada em vez de enviar a mensagem
        if (!isSandbox) {
          await toolRegistry.executeWithValidation('guardrail-escalate', 'escalate_to_human', JSON.stringify({
            reason: 'objecao_complexa',
            summary: `Guardrail forçou escalada: ${guardrailResult.escalateReason}`,
            urgency: 'high',
          }), toolCtx)
        }
        resultType = 'escalated'
        done = true
        break
      }

      // Enviar resposta ao lead
      if (!isSandbox) {
        await sendWhatsApp(supabase, lead.id as string, text, instanceName)
      }
      memoryManager.appendAssistantMessage(text)
      responseText = text
      done = true
    }
  }

  return {
    result: resultType,
    responseText,
    totalTokens: conversation.total_tokens_used,
    totalCostUsd: conversation.total_cost_usd,
    iterations,
    toolCalls: allToolCalls,
  }
}

// --- Helper ---

async function sendWhatsApp(
  supabase: SupabaseClient,
  leadId: string,
  content: string,
  instanceName: string | null,
): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    await fetch(`${url}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        leadId,
        content,
        messageType: 'text',
        senderType: 'ai',
        instanceName,
      }),
    })
  } catch (err) {
    console.error('[agent-loop] WhatsApp send failed:', err)
  }
}
