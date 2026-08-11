/**
 * MemoryManager — Gerencia contexto da conversa para o LLM.
 * Onda 1 (simplificada): ultimas 20 mensagens do banco + turn atual em memoria.
 * Sem compressao de contexto nesta onda.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ToolCall } from '../_shared/hub-client.ts'

const MAX_HISTORY_MESSAGES = 20

// --- Types ---

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ConversationContext {
  systemPrompt: string
  messages: ChatMessage[]
}

// --- Manager ---

export class MemoryManager {
  private turnMessages: ChatMessage[] = []
  private historyMessages: ChatMessage[] = []
  private systemPrompt = ''

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  async loadHistory(supabase: SupabaseClient, leadId: string): Promise<void> {
    const { data: messages } = await supabase
      .from('messages')
      .select('content, sender_type')
      .eq('lead_id', leadId)
      .in('sender_type', ['lead', 'ai'])
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    if (!messages) return

    this.historyMessages = messages.map((m: { content: string; sender_type: string }) => ({
      role: m.sender_type === 'lead' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }))
  }

  appendUserMessage(content: string): void {
    this.turnMessages.push({ role: 'user', content })
  }

  appendAssistantMessage(content: string): void {
    this.turnMessages.push({ role: 'assistant', content })
  }

  appendAssistantToolCalls(content: string | null, toolCalls: ToolCall[]): void {
    this.turnMessages.push({ role: 'assistant', content, tool_calls: toolCalls })
  }

  appendToolResult(toolCallId: string, result: string): void {
    this.turnMessages.push({ role: 'tool', content: result, tool_call_id: toolCallId })
  }

  buildContext(): ConversationContext {
    return {
      systemPrompt: this.systemPrompt,
      messages: [...this.historyMessages, ...this.turnMessages],
    }
  }
}
