/**
 * ToolRegistry — Catalogo de tools registradas dinamicamente por Agent Profile.
 * Valida argumentos com schema, executa handler, loga em sdr_tool_calls.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubClient, OpenAIToolDef } from './hub-client.ts'

// --- Types ---

export interface ToolContext {
  supabase: SupabaseClient
  lead: Record<string, unknown>
  conversation: { id: string; current_iteration: number }
  agentProfile: Record<string, unknown>
  companyId: string
  hubClient: HubClient
  isSandbox: boolean
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  terminal?: boolean
}

interface SchemaProperty {
  type: string
  description?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  items?: SchemaProperty
  default?: unknown
  properties?: Record<string, SchemaProperty>
  required?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, SchemaProperty>
  required?: string[]
  validate: (args: Record<string, unknown>) => { ok: boolean; error?: string }
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

// --- Registry ---

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  openAISchema(): OpenAIToolDef[] {
    return Array.from(this.tools.values()).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.parameters,
          required: t.required ?? [],
        },
      },
    }))
  }

  async executeWithValidation(
    toolCallId: string,
    toolName: string,
    rawArgs: string,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return this.logAndReturn(ctx, toolName, {}, {
        ok: false, error: `Tool '${toolName}' nao registrada`,
      }, 'validation_failed')
    }

    let args: Record<string, unknown>
    try {
      args = JSON.parse(rawArgs)
    } catch {
      return this.logAndReturn(ctx, toolName, { raw: rawArgs }, {
        ok: false, error: 'Argumentos JSON invalidos',
      }, 'validation_failed')
    }

    const validation = tool.validate(args)
    if (!validation.ok) {
      return this.logAndReturn(ctx, toolName, args, {
        ok: false, error: validation.error ?? 'Validacao falhou',
      }, 'validation_failed')
    }

    const startMs = Date.now()
    try {
      const result = await tool.handler(args, ctx)
      const durationMs = Date.now() - startMs
      await this.logToolCall(ctx, toolName, args, result, 'success', null, durationMs)
      return result
    } catch (err) {
      const durationMs = Date.now() - startMs
      const message = err instanceof Error ? err.message : String(err)
      const result: ToolResult = { ok: false, error: message }
      await this.logToolCall(ctx, toolName, args, result, 'execution_failed', message, durationMs)
      return result
    }
  }

  private async logAndReturn(
    ctx: ToolContext,
    toolName: string,
    args: Record<string, unknown>,
    result: ToolResult,
    status: string,
  ): Promise<ToolResult> {
    await this.logToolCall(ctx, toolName, args, result, status, result.error ?? null, 0)
    return result
  }

  private async logToolCall(
    ctx: ToolContext,
    toolName: string,
    args: Record<string, unknown>,
    result: ToolResult,
    status: string,
    errorMessage: string | null,
    durationMs: number,
  ): Promise<void> {
    if (ctx.isSandbox) return

    try {
      await ctx.supabase.from('sdr_tool_calls').insert({
        conversation_id: ctx.conversation.id,
        company_id: ctx.companyId,
        iteration_number: ctx.conversation.current_iteration,
        tool_name: toolName,
        arguments: args,
        result,
        status,
        error_message: errorMessage,
        duration_ms: durationMs,
      })
    } catch (err) {
      console.error('[tool-registry] Failed to log tool call:', err)
    }
  }
}
