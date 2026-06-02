// --- Agent Profile ---

export type AgentGender = 'female' | 'male' | 'neutral'
export type AgentTone = 'formal' | 'informal' | 'coloquial' | 'tecnico'
export type AgentPersonality = 'consultiva' | 'objetiva' | 'calorosa' | 'tecnica'
export type AgentPurpose = 'qualification' | 'appointment_booking' | 'direct_sales' | 'support' | 'recovery'
export type AgentOperatingMode = 'full_auto' | 'suggest_mode'
export type KnowledgeBaseStatus = 'empty' | 'processing' | 'ready' | 'error'
export type ToolName =
  | 'qualify_lead'
  | 'update_lead_field'
  | 'escalate_to_human'
  | 'query_business_knowledge'
  | 'schedule_meeting'
  | 'send_payment_link'
  | 'schedule_followup'
  | 'end_conversation'

export interface BusinessHours {
  timezone: string
  windows: Array<{
    days: number[]          // 0=dom, 1=seg, ..., 6=sab
    start: string           // "08:00"
    end: string             // "18:00"
  }>
}

export interface AgentProfile {
  id: string
  pipeline_id: string
  company_id: string
  agent_name: string
  agent_gender: AgentGender
  tone: AgentTone
  personality: AgentPersonality
  disclose_ai: boolean
  company_description: string
  value_proposition: string
  differentiators: string | null
  ideal_customer_profile: string | null
  purpose: AgentPurpose
  primary_goal: string
  enabled_tools: ToolName[]
  max_iterations_per_turn: number
  max_tokens_per_conversation: number
  max_payment_value_brl: number
  operating_mode: AgentOperatingMode
  business_hours: BusinessHours
  followup_cadence: number[]
  followup_max_attempts: number
  knowledge_base_status: KnowledgeBaseStatus
  knowledge_base_version: number
  forbidden_topics: string[]
  must_escalate_keywords: string[]
  custom_guardrails: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// --- SDR Conversations ---

export type SdrConversationStatus = 'active' | 'escalated' | 'completed' | 'abandoned' | 'failed'

export interface SdrConversation {
  id: string
  lead_id: string
  pipeline_id: string
  agent_profile_id: string
  company_id: string
  status: SdrConversationStatus
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

// --- SDR Followups ---

export type SdrFollowupStatus = 'pending' | 'sent' | 'cancelled' | 'failed'

export interface SdrFollowup {
  id: string
  conversation_id: string
  lead_id: string
  company_id: string
  attempt_number: number
  scheduled_for: string
  message: string
  reasoning: string
  cancel_if_lead_responds: boolean
  status: SdrFollowupStatus
  sent_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
}

// --- Tool Calls ---

export type ToolCallStatus = 'success' | 'validation_failed' | 'execution_failed' | 'guardrail_blocked'

export interface SdrToolCall {
  id: string
  conversation_id: string
  company_id: string
  iteration_number: number
  tool_name: string
  arguments: Record<string, unknown>
  result: Record<string, unknown> | null
  status: ToolCallStatus
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

// --- Payments ---

export type PaymentStatus = 'pending' | 'received' | 'overdue' | 'cancelled' | 'refunded'
export type PaymentGeneratedBy = 'sdr_ai' | 'manual'

export interface Payment {
  id: string
  lead_id: string
  conversation_id: string | null
  company_id: string
  asaas_charge_id: string
  amount_brl: number
  description: string
  payment_methods: string[]
  due_date: string
  payment_url: string
  status: PaymentStatus
  paid_at: string | null
  generated_by: PaymentGeneratedBy
  created_at: string
  updated_at: string
}

// --- Knowledge Chunks ---

export interface KnowledgeChunkMetadata {
  page_number?: number
  section_title?: string
  word_count: number
}

export interface AgentKnowledgeChunk {
  id: string
  agent_profile_id: string
  company_id: string
  source_file_name: string
  source_file_url: string
  chunk_index: number
  content: string
  metadata: KnowledgeChunkMetadata
  knowledge_base_version: number
  created_at: string
}

// --- Metrics ---

export interface SdrV2Metrics {
  conversations_started: number
  conversations_active: number
  qualification_rate: number
  escalation_count: number
}

// --- Presets ---

export const TOOL_PRESETS_BY_PURPOSE: Record<AgentPurpose, ToolName[]> = {
  qualification: ['qualify_lead', 'update_lead_field', 'escalate_to_human', 'query_business_knowledge'],
  appointment_booking: ['qualify_lead', 'update_lead_field', 'escalate_to_human', 'query_business_knowledge'],
  direct_sales: ['qualify_lead', 'update_lead_field', 'escalate_to_human', 'query_business_knowledge'],
  support: ['update_lead_field', 'escalate_to_human', 'query_business_knowledge'],
  recovery: ['update_lead_field', 'escalate_to_human', 'query_business_knowledge'],
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  windows: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }],
}

export const DEFAULT_FOLLOWUP_CADENCE = [60, 1440, 4320, 10080, 20160]

