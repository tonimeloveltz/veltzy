/**
 * ConversationStateManager — CRUD para veltzy.sdr_conversations.
 * Gerencia ciclo de vida: criar, resumir, incrementar, fechar.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubUsage } from './hub-client.ts'

const ABANDON_THRESHOLD_DAYS = 7

// --- Types ---

export interface ConversationRecord {
  id: string
  lead_id: string
  pipeline_id: string
  agent_profile_id: string
  company_id: string
  status: string
  current_iteration: number
  total_iterations: number
  total_tokens_used: number
  total_cost_usd: number
  end_reason: string | null
  end_summary: string | null
  started_at: string
  last_activity_at: string
  ended_at: string | null
}

// --- Manager ---

export class ConversationStateManager {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOrCreateActive(
    leadId: string,
    pipelineId: string,
    agentProfileId: string,
    companyId: string,
  ): Promise<ConversationRecord> {
    // Buscar conversa ativa para o lead
    const { data: existing } = await this.supabase
      .from('sdr_conversations')
      .select('*')
      .eq('lead_id', leadId)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Heartbeat: se inativa ha mais de 7 dias, fechar como abandoned e criar nova
      const lastActivity = new Date(existing.last_activity_at)
      const now = new Date()
      const diffDays = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)

      if (diffDays >= ABANDON_THRESHOLD_DAYS) {
        await this.close(existing.id, 'abandoned', 'timeout', 'Conversa inativa por 7+ dias')
        return this.createNew(leadId, pipelineId, agentProfileId, companyId)
      }

      // Resetar current_iteration para novo turn (mantem total_iterations)
      await this.supabase
        .from('sdr_conversations')
        .update({ current_iteration: 0, last_activity_at: new Date().toISOString() })
        .eq('id', existing.id)

      return { ...existing, current_iteration: 0 }
    }

    return this.createNew(leadId, pipelineId, agentProfileId, companyId)
  }

  async incrementIteration(conversationId: string, usage: HubUsage): Promise<ConversationRecord> {
    // Buscar estado atual para somar
    const { data: current } = await this.supabase
      .from('sdr_conversations')
      .select('current_iteration, total_iterations, total_tokens_used, total_cost_usd')
      .eq('id', conversationId)
      .single()

    if (!current) throw new Error(`Conversation ${conversationId} not found`)

    const updated = {
      current_iteration: current.current_iteration + 1,
      total_iterations: current.total_iterations + 1,
      total_tokens_used: current.total_tokens_used + usage.total_tokens,
      total_cost_usd: current.total_cost_usd + usage.cost_usd,
      last_activity_at: new Date().toISOString(),
    }

    const { data } = await this.supabase
      .from('sdr_conversations')
      .update(updated)
      .eq('id', conversationId)
      .select('*')
      .single()

    return data!
  }

  async close(
    conversationId: string,
    status: 'escalated' | 'completed' | 'abandoned' | 'failed',
    endReason: string,
    endSummary: string,
  ): Promise<void> {
    await this.supabase
      .from('sdr_conversations')
      .update({
        status,
        end_reason: endReason,
        end_summary: endSummary,
        ended_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
  }

  createInMemory(
    leadId: string,
    pipelineId: string,
    agentProfileId: string,
    companyId: string,
  ): ConversationRecord {
    return {
      id: 'sandbox-' + crypto.randomUUID(),
      lead_id: leadId,
      pipeline_id: pipelineId,
      agent_profile_id: agentProfileId,
      company_id: companyId,
      status: 'active',
      current_iteration: 0,
      total_iterations: 0,
      total_tokens_used: 0,
      total_cost_usd: 0,
      end_reason: null,
      end_summary: null,
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      ended_at: null,
    }
  }

  private async createNew(
    leadId: string,
    pipelineId: string,
    agentProfileId: string,
    companyId: string,
  ): Promise<ConversationRecord> {
    const { data, error } = await this.supabase
      .from('sdr_conversations')
      .insert({
        lead_id: leadId,
        pipeline_id: pipelineId,
        agent_profile_id: agentProfileId,
        company_id: companyId,
      })
      .select('*')
      .single()

    if (error || !data) throw new Error(`Failed to create conversation: ${error?.message}`)
    return data
  }
}
