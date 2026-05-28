/**
 * Tool: qualify_lead
 * Atualiza score (0-100) e temperatura do lead com base na conversa.
 * Sandbox: retorna resultado simulado sem atualizar leads no banco.
 */

import { ToolDefinition, ToolResult, ToolContext } from '../tool-registry.ts'

const VALID_TEMPERATURES = ['cold', 'warm', 'hot', 'fire'] as const
const VALID_SIGNALS = [
  'orcamento_mencionado', 'urgencia_alta', 'autoridade_decisao',
  'necessidade_clara', 'timing_definido', 'concorrente_mencionado',
  'objecao_preco', 'objecao_timing', 'sem_interesse',
] as const

export const qualifyLeadTool: ToolDefinition = {
  name: 'qualify_lead',

  description:
    'Use esta tool quando tiver informacao suficiente para qualificar o lead. ' +
    'score=0 sem interesse algum, score=100 lead pronto para fechar. ' +
    'temperature: cold=0-30, warm=31-60, hot=61-85, fire=86-100. ' +
    'reasoning explica brevemente o porque do score.',

  parameters: {
    score: { type: 'number', minimum: 0, maximum: 100, description: 'Score de qualificacao 0-100' },
    temperature: { type: 'string', enum: [...VALID_TEMPERATURES], description: 'Temperatura do lead' },
    reasoning: { type: 'string', minLength: 10, maxLength: 500, description: 'Justificativa do score' },
    detected_signals: {
      type: 'array',
      items: { type: 'string', enum: [...VALID_SIGNALS] },
      description: 'Sinais detectados na conversa',
    },
  },
  required: ['score', 'temperature', 'reasoning'],

  validate(args: Record<string, unknown>): { ok: boolean; error?: string } {
    const score = args.score as number
    if (typeof score !== 'number' || score < 0 || score > 100) {
      return { ok: false, error: 'score deve ser numero entre 0 e 100' }
    }
    if (!VALID_TEMPERATURES.includes(args.temperature as typeof VALID_TEMPERATURES[number])) {
      return { ok: false, error: `temperature deve ser: ${VALID_TEMPERATURES.join(', ')}` }
    }
    const reasoning = args.reasoning as string
    if (typeof reasoning !== 'string' || reasoning.length < 10 || reasoning.length > 500) {
      return { ok: false, error: 'reasoning deve ter 10-500 caracteres' }
    }
    if (args.detected_signals !== undefined) {
      if (!Array.isArray(args.detected_signals)) {
        return { ok: false, error: 'detected_signals deve ser array' }
      }
      for (const s of args.detected_signals) {
        if (!VALID_SIGNALS.includes(s as typeof VALID_SIGNALS[number])) {
          return { ok: false, error: `Sinal invalido: ${s}` }
        }
      }
    }
    return { ok: true }
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const score = Math.min(100, Math.max(0, Math.round(args.score as number)))
    const temperature = args.temperature as string

    // Sandbox: retorna resultado sem side effect
    if (ctx.isSandbox) {
      return { ok: true, data: { score, temperature, sandbox: true } }
    }

    await ctx.supabase
      .from('leads')
      .update({ ai_score: score, temperature })
      .eq('id', ctx.lead.id)

    return { ok: true, data: { score, temperature } }
  },
}
