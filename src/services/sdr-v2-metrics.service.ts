import { veltzy } from '@/lib/supabase'
import type { SdrV2Metrics } from '@/types/sdr-v2'
import { USD_TO_BRL } from '@/types/sdr-v2'

// --- Types ---

export interface SdrV2MetricsFilters {
  companyId: string
  pipelineId?: string
  periodDays: number  // 1, 7, 30, 90
}

export interface SdrV2ConversationRow {
  id: string
  lead_id: string
  lead_name: string | null
  lead_phone: string | null
  pipeline_name: string | null
  status: string
  total_iterations: number
  total_tokens_used: number
  total_cost_usd: number
  started_at: string
  last_activity_at: string
  ended_at: string | null
}

export interface SdrV2ConversationDetail {
  conversation: SdrV2ConversationRow
  toolCalls: Array<{
    id: string
    tool_name: string
    arguments: Record<string, unknown>
    result: Record<string, unknown> | null
    status: string
    duration_ms: number | null
    created_at: string
  }>
}

// --- Metrics ---

export async function getSdrV2Metrics(filters: SdrV2MetricsFilters): Promise<SdrV2Metrics> {
  const since = new Date()
  since.setDate(since.getDate() - filters.periodDays)
  const sinceIso = since.toISOString()

  let query = veltzy()
    .from('sdr_conversations')
    .select('id, status, total_tokens_used, total_cost_usd')
    .eq('company_id', filters.companyId)
    .gte('started_at', sinceIso)

  if (filters.pipelineId) {
    query = query.eq('pipeline_id', filters.pipelineId)
  }

  const { data: conversations, error } = await query

  if (error) throw error
  const convs = conversations ?? []

  // Conversas ativas (sem filtro de periodo)
  let activeQuery = veltzy()
    .from('sdr_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', filters.companyId)
    .eq('status', 'active')

  if (filters.pipelineId) {
    activeQuery = activeQuery.eq('pipeline_id', filters.pipelineId)
  }

  const { count: activeCount } = await activeQuery

  // Tool calls count
  const conversationIds = convs.map((c) => c.id)
  let totalToolCalls = 0
  if (conversationIds.length > 0) {
    const { count } = await veltzy()
      .from('sdr_tool_calls')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)

    totalToolCalls = count ?? 0
  }

  // Qualify count (leads com ai_score >= 60 que tiveram conversa no periodo)
  let qualifiedCount = 0
  if (conversationIds.length > 0) {
    // Buscar lead_ids das conversas
    const { data: convLeads } = await veltzy()
      .from('sdr_conversations')
      .select('lead_id')
      .in('id', conversationIds)

    if (convLeads && convLeads.length > 0) {
      const uniqueLeadIds = [...new Set(convLeads.map((c) => c.lead_id))]
      const { count } = await veltzy()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('id', uniqueLeadIds)
        .gte('ai_score', 60)

      qualifiedCount = count ?? 0
    }
  }

  const totalCostUsd = convs.reduce((sum, c) => sum + (c.total_cost_usd ?? 0), 0)
  const escalatedCount = convs.filter((c) => c.status === 'escalated').length

  return {
    conversations_started: convs.length,
    conversations_active: activeCount ?? 0,
    qualification_rate: convs.length > 0 ? qualifiedCount / convs.length : 0,
    escalation_count: escalatedCount,
    total_cost_brl: totalCostUsd * USD_TO_BRL,
    avg_cost_per_conversation_brl: convs.length > 0 ? (totalCostUsd / convs.length) * USD_TO_BRL : 0,
    total_tokens: convs.reduce((sum, c) => sum + (c.total_tokens_used ?? 0), 0),
    total_tool_calls: totalToolCalls,
  }
}

// --- Conversations list ---

export async function getSdrV2Conversations(filters: SdrV2MetricsFilters): Promise<SdrV2ConversationRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - filters.periodDays)
  const sinceIso = since.toISOString()

  let query = veltzy()
    .from('sdr_conversations')
    .select(`
      id, lead_id, status, total_iterations, total_tokens_used, total_cost_usd,
      started_at, last_activity_at, ended_at,
      leads!inner(name, phone),
      pipelines!inner(name)
    `)
    .eq('company_id', filters.companyId)
    .gte('started_at', sinceIso)
    .order('last_activity_at', { ascending: false })
    .limit(50)

  if (filters.pipelineId) {
    query = query.eq('pipeline_id', filters.pipelineId)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => {
    const lead = row.leads as Record<string, unknown> | null
    const pipeline = row.pipelines as Record<string, unknown> | null
    return {
      id: row.id as string,
      lead_id: row.lead_id as string,
      lead_name: (lead?.name as string) ?? null,
      lead_phone: (lead?.phone as string) ?? null,
      pipeline_name: (pipeline?.name as string) ?? null,
      status: row.status as string,
      total_iterations: row.total_iterations as number,
      total_tokens_used: row.total_tokens_used as number,
      total_cost_usd: row.total_cost_usd as number,
      started_at: row.started_at as string,
      last_activity_at: row.last_activity_at as string,
      ended_at: (row.ended_at as string) ?? null,
    }
  })
}

// --- Conversation detail ---

export async function getSdrV2ConversationDetail(conversationId: string): Promise<SdrV2ConversationDetail | null> {
  const { data: conv, error: convError } = await veltzy()
    .from('sdr_conversations')
    .select(`
      id, lead_id, status, total_iterations, total_tokens_used, total_cost_usd,
      started_at, last_activity_at, ended_at,
      leads!inner(name, phone),
      pipelines!inner(name)
    `)
    .eq('id', conversationId)
    .single()

  if (convError || !conv) return null

  const { data: toolCalls } = await veltzy()
    .from('sdr_tool_calls')
    .select('id, tool_name, arguments, result, status, duration_ms, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  const lead = (conv as Record<string, unknown>).leads as Record<string, unknown> | null
  const pipeline = (conv as Record<string, unknown>).pipelines as Record<string, unknown> | null

  return {
    conversation: {
      id: conv.id,
      lead_id: conv.lead_id,
      lead_name: (lead?.name as string) ?? null,
      lead_phone: (lead?.phone as string) ?? null,
      pipeline_name: (pipeline?.name as string) ?? null,
      status: conv.status,
      total_iterations: conv.total_iterations,
      total_tokens_used: conv.total_tokens_used,
      total_cost_usd: conv.total_cost_usd,
      started_at: conv.started_at,
      last_activity_at: conv.last_activity_at,
      ended_at: conv.ended_at,
    },
    toolCalls: (toolCalls ?? []) as SdrV2ConversationDetail['toolCalls'],
  }
}
