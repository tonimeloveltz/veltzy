/**
 * Tool: query_business_knowledge
 * Busca semantica na knowledge base da empresa (RAG via pgvector).
 * Sandbox: executa normalmente (read-only, sem side effects).
 */

import { ToolDefinition, ToolResult, ToolContext } from '../tool-registry.ts'

export const queryBusinessKnowledgeTool: ToolDefinition = {
  name: 'query_business_knowledge',

  description:
    'Use esta tool quando precisar de informacao especifica sobre produtos, precos, FAQs, politicas, ' +
    'ou diferenciais que a empresa carregou. Pergunte em forma de pergunta natural ' +
    '(\'Qual o preco do plano Pro?\' ou \'Quais sao as formas de pagamento aceitas?\'). ' +
    'Nao invente informacao, sempre consulte primeiro.',

  parameters: {
    query: { type: 'string', minLength: 5, maxLength: 500, description: 'Pergunta para buscar na knowledge base' },
    top_k: { type: 'number', minimum: 1, maximum: 10, description: 'Numero maximo de resultados', default: 5 },
  },
  required: ['query'],

  validate(args: Record<string, unknown>): { ok: boolean; error?: string } {
    const query = args.query as string
    if (typeof query !== 'string' || query.length < 5 || query.length > 500) {
      return { ok: false, error: 'query deve ter 5-500 caracteres' }
    }
    if (args.top_k !== undefined) {
      const topK = args.top_k as number
      if (typeof topK !== 'number' || topK < 1 || topK > 10) {
        return { ok: false, error: 'top_k deve ser numero entre 1 e 10' }
      }
    }
    return { ok: true }
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = args.query as string
    const topK = (args.top_k as number) ?? 5
    const agentProfileId = ctx.agentProfile.id as string
    const kbStatus = ctx.agentProfile.knowledge_base_status as string

    // Verificar se knowledge base esta pronta
    if (kbStatus !== 'ready') {
      return {
        ok: true,
        data: {
          chunks: [],
          warning: kbStatus === 'processing'
            ? 'Knowledge base ainda esta sendo processada. Tente novamente em alguns minutos.'
            : 'Knowledge base nao configurada. Nenhum documento foi carregado.',
        },
      }
    }

    // Gerar embedding da query via Hub
    const embeddingsResponse = await ctx.hubClient.embeddings({
      company_id: ctx.companyId,
      product: 'veltzy',
      feature: 'sdr-knowledge-search',
      input: query,
    })

    if (!embeddingsResponse.ok || !embeddingsResponse.data?.embeddings?.[0]) {
      return { ok: false, error: 'Falha ao gerar embedding da consulta' }
    }

    const queryEmbedding = embeddingsResponse.data.embeddings[0]

    // Buscar chunks via funcao SQL
    const embeddingStr = `[${queryEmbedding.join(',')}]`
    const { data: chunks, error } = await ctx.supabase
      .rpc('search_knowledge_chunks', {
        p_agent_profile_id: agentProfileId,
        p_query_embedding: embeddingStr,
        p_top_k: topK,
        p_min_score: 0.7,
      })

    if (error) {
      console.error('[query_business_knowledge] RPC error:', error)
      return { ok: false, error: 'Erro ao buscar na knowledge base' }
    }

    if (!chunks || chunks.length === 0) {
      return {
        ok: true,
        data: { chunks: [], warning: 'Nenhum resultado relevante encontrado na knowledge base.' },
      }
    }

    return {
      ok: true,
      data: {
        chunks: chunks.map((c: Record<string, unknown>) => ({
          content: c.content,
          similarity: c.similarity,
          source_file_name: c.source_file_name,
        })),
      },
    }
  },
}
