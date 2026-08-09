export type AppRole = 'super_admin' | 'admin' | 'manager' | 'seller' | 'representative'
export type LeadStatus = 'new' | 'qualifying' | 'open' | 'deal' | 'lost' | 'archived'
export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'fire'
export type SenderType = 'ai' | 'human' | 'lead' | 'internal'
export type ConversationStatus = 'unread' | 'read' | 'replied' | 'waiting_client' | 'waiting_internal' | 'resolved'
export type IntegrationType = 'manual' | 'webhook' | 'whatsapp_api' | 'instagram_api' | 'linkedin_api'
export type WhatsAppProviderType = 'zapi' | 'evolution' | 'cloud_api'
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface CompanyFeatures {
  whatsapp_enabled: boolean
  instagram_enabled: boolean
  ai_sdr_enabled: boolean
  custom_pipeline: boolean
  export_reports: boolean
  automation_rules: boolean
  max_users: number
  max_leads: number
}

/** Allowlist de categorias de conexao WhatsApp (Hub-owned, Veltzy le via RLS). */
export interface WhatsAppCategories {
  official: boolean
  qr_code: boolean
}

export interface Company {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  features: CompanyFeatures
  settings: Record<string, unknown>
  whatsapp_categories: WhatsAppCategories | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Mapa phone_number_id -> empresa (veltzy.cloud_api_numbers). Meta Cloud API. */
export interface CloudApiNumber {
  id: string
  company_id: string
  phone_number_id: string
  waba_id: string | null
  display_number: string | null
  instance_label: string | null
  access_token: string | null
  status: 'active' | 'offboarded'
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  user_id: string
  company_id: string | null
  email: string
  name: string
  is_available: boolean
  default_whatsapp_instance: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface UserRole {
  id: string
  user_id: string
  company_id: string | null
  role: AppRole
}

export interface CompanyWithRole {
  id: string
  name: string
  slug: string
  role: AppRole
}

export interface Permission {
  id: string
  key: string
  description: string | null
  product: string
}

export interface Invitation {
  id: string
  company_id: string
  invited_by: string
  email: string
  role: AppRole
  token: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  created_at: string
  // Desnormalizado no momento do convite. Null nos convites criados antes da adição da coluna.
  company_name: string | null
}

export type TransferRequestType = 'duplicate_conflict' | 'queue_transfer' | 'manual_transfer'
export type TransferRequestStatus = 'pending' | 'approved' | 'rejected'

export interface LeadTransferRequest {
  id: string
  company_id: string
  lead_id: string
  requested_by: string
  requested_to: string
  type: TransferRequestType
  status: TransferRequestStatus
  resolved_by: string | null
  notes: string | null
  created_at: string
  resolved_at: string | null
}

export type AuthAuditEvent =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_revoked'
  | 'role_changed'
  | 'company_switched'
  | 'password_reset'
  | 'google_oauth_linked'
  | 'login_new_device'

export interface AuthAuditLog {
  id: string
  user_id: string | null
  company_id: string | null
  event: AuthAuditEvent
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface SystemSetting {
  id: string
  company_id: string
  key: string
  value: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Pipeline {
  id: string
  company_id: string
  name: string
  slug: string
  color: string
  position: number
  is_default: boolean
  is_active: boolean
  sdr_instance_name: string | null
  sdr_transfer_message_template: string | null
  created_at: string
  updated_at: string
}

export interface UserPipelineAccess {
  id: string
  user_id: string
  pipeline_id: string
  company_id: string
  created_at: string
}

export interface PipelineStage {
  id: string
  company_id: string
  pipeline_id: string
  name: string
  slug: string
  position: number
  color: string
  is_final: boolean
  is_positive: boolean | null
  created_at: string
  updated_at: string
}

/** Tipos de origem que uma regra de roteamento pode casar (mais especifico vence). */
export type RoutingMatchType = 'ad_id' | 'campaign_id' | 'utm_campaign' | 'instance' | 'webhook_source'

/** Regra origem -> pipeline, por empresa. Tabela veltzy.pipeline_routing_rules. */
export interface PipelineRoutingRule {
  id: string
  company_id: string
  pipeline_id: string
  match_type: RoutingMatchType
  match_value: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AdContext {
  ad_id?: string
  ad_title?: string
  ad_body?: string
  photo_url?: string
  media_url?: string
  media_type?: 'image' | 'video'
  source?: string
  source_url?: string
  ctwa_clid?: string
}

export interface Lead {
  id: string
  company_id: string
  pipeline_id: string
  name: string | null
  phone: string
  email: string | null
  instagram_id: string | null
  linkedin_id: string | null
  source_id: string | null
  stage_id: string
  status: LeadStatus
  temperature: LeadTemperature
  ai_score: number
  assigned_to: string | null
  is_ai_active: boolean
  is_queued: boolean
  conversation_status: ConversationStatus
  tags: string[]
  deal_value: number | null
  observations: string | null
  avatar_url: string | null
  ad_context: AdContext | null
  whatsapp_instance_name: string | null
  cloud_api_number_id: string | null
  company_name: string | null
  transfer_summary: string | null
  last_customer_message_at: string | null
  sla_breached: boolean
  first_response_at: string | null
  instagram_handle: string | null
  linkedin_url: string | null
  created_at: string
  updated_at: string
}

export interface LeadWithDetails extends Lead {
  profiles?: Partial<Profile> | null
  lead_sources?: LeadSourceRecord | null
  pipeline_stages?: PipelineStage | null
  pipelines?: Pipeline | null
}

export interface CreateLeadInput {
  name?: string
  phone: string
  email?: string
  company_name?: string
  source_id?: string
  stage_id: string
  pipeline_id: string
  temperature?: LeadTemperature
  deal_value?: number
  observations?: string
  assigned_to?: string
  tags?: string[]
  instagram_handle?: string
  linkedin_url?: string
  whatsapp_instance_name?: string | null
  cloud_api_number_id?: string | null
}

export interface UpdateLeadInput {
  // Campos de negocio (stage_id, status, deal_value) saiu daqui: negocio se
  // edita via deals; o espelho replica para leads. pipeline_id nunca esteve.
  name?: string | null
  phone?: string
  email?: string | null
  company_name?: string | null
  source_id?: string | null
  temperature?: LeadTemperature
  ai_score?: number
  assigned_to?: string | null
  is_ai_active?: boolean
  tags?: string[]
  observations?: string | null
  conversation_status?: ConversationStatus
  instagram_handle?: string | null
  linkedin_url?: string | null
}

// --- Deal (Negocio) ---

export type DealStatus = 'open' | 'won' | 'lost' | 'archived' | 'pending_assignment'

export interface Deal {
  id: string
  company_id: string
  lead_id: string
  name: string
  value: number
  stage_id: string | null
  pipeline_id: string | null
  assigned_to: string | null
  status: DealStatus
  closed_at: string | null
  observations: string | null
  // origem (feature origem-por-pipeline: roteamento e relatorio de conversao)
  source_id: string | null
  origin_instance_name: string | null
  origin_ad_id: string | null
  origin_campaign_id: string | null
  origin_utm_campaign: string | null
  routing_rule_id: string | null
  created_at: string
  updated_at: string
  // joins
  lead?: Lead
  stage?: PipelineStage
  pipeline?: Pipeline
  assignee?: Partial<Profile> | null
}

export interface DealWithLead extends Deal {
  leads?: Pick<Lead, 'id' | 'name' | 'phone' | 'email' | 'avatar_url' | 'temperature' | 'tags' | 'is_ai_active' | 'transfer_summary' | 'source_id' | 'company_name' | 'created_at' | 'whatsapp_instance_name'> & {
    lead_sources?: LeadSourceRecord | null
  }
  profiles?: Partial<Profile> | null
  pipeline_stages?: PipelineStage | null
  pipelines?: Pipeline | null
}

export interface CreateDealInput {
  lead_id: string
  name: string
  pipeline_id: string
  stage_id?: string
  value?: number
  assigned_to?: string | null
  status?: DealStatus
  closed_at?: string | null
  observations?: string | null
}

export interface UpdateDealInput {
  name?: string
  value?: number
  stage_id?: string | null
  pipeline_id?: string | null
  assigned_to?: string | null
  status?: DealStatus
  observations?: string | null
}

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
export type MessageSource = 'whatsapp' | 'instagram' | 'linkedin' | 'manual'
export type WhatsAppStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

export interface Message {
  id: string
  lead_id: string
  company_id: string
  content: string
  sender_type: SenderType
  message_type: MessageType
  file_url: string | null
  file_name: string | null
  file_mime_type: string | null
  file_size: number | null
  source: MessageSource
  external_id: string | null
  replied_message_id: string | null
  instance_name: string | null
  delivery_status: DeliveryStatus
  delivery_error: string | null
  is_scheduled: boolean
  scheduled_at: string | null
  is_read: boolean
  created_at: string
}

export interface SendMessagePayload {
  leadId: string
  content: string
  messageType?: MessageType
  fileUrl?: string
  fileName?: string
  mimeType?: string
  repliedMessageId?: string
  instanceName?: string
}

export interface WhatsAppConfig {
  id: string
  company_id: string
  instance_id: string
  instance_token: string
  client_token: string
  phone_number: string | null
  status: WhatsAppStatus
  qr_code: string | null
  connected_at: string | null
  created_at: string
  updated_at: string
}

export interface ReplyTemplate {
  id: string
  company_id: string
  title: string
  content: string
  category: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  company_id: string
  name: string
  description: string | null
  link: string | null
  category: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LeadWithLastMessage extends Omit<Lead, 'stage_id' | 'status' | 'deal_value'> {
  profiles?: Partial<Profile> | null
  lead_sources?: LeadSourceRecord | null
  last_message?: Pick<Message, 'content' | 'sender_type' | 'created_at' | 'message_type'> | null
  unread_count?: number
}

export type AutomationTrigger = 'lead_created' | 'lead_stage_changed' | 'lead_temperature_changed' | 'message_received' | 'no_response' | 'deal_closed' | 'lead_lost'
export type AutomationAction = 'send_message' | 'change_stage' | 'assign_lead' | 'add_tag' | 'remove_tag' | 'update_temperature' | 'send_webhook' | 'notify_team'
export type NotificationType = 'new_lead' | 'lead_assigned' | 'new_message' | 'lead_transferred' | 'system' | 'copilot' | 'territory_conflict'

export interface AutomationCondition {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in'
  value: unknown
}

export interface AutomationRule {
  id: string
  company_id: string
  name: string
  trigger_type: AutomationTrigger
  conditions: AutomationCondition[]
  action_type: AutomationAction
  action_data: Record<string, unknown>
  priority: number
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface AutomationLog {
  id: string
  company_id: string
  rule_id: string | null
  lead_id: string | null
  status: 'success' | 'failed' | 'skipped'
  trigger_data: Record<string, unknown>
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  error_message: string | null
  executed_at: string
}

export interface Notification {
  id: string
  company_id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  action_type: string | null
  action_data: Record<string, unknown>
  is_read: boolean
  created_at: string
}

export interface SdrConfig {
  enabled: boolean
  prompt: string
}

export interface AutoReplyConfig {
  enabled: boolean
  message: string
  schedule: {
    start: string
    end: string
    days: number[]
    timezone: string
  }
}

export interface CompanyInvite {
  id: string
  company_id: string
  invited_by: string
  email: string
  role: AppRole
  token: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  created_at: string
  company_name: string | null
}

export interface ProfileWithRole extends Profile {
  user_roles?: UserRole[]
}

export interface ConversionMetrics {
  totalLeads: number
  dealsClosed: number
  conversionRate: number
  totalRevenue: number
  prevTotalLeads: number
  prevDealsClosed: number
  prevConversionRate: number
  prevTotalRevenue: number
}

export interface SourceMetrics {
  source_id: string
  name: string
  color: string
  count: number
}

export interface StageMetrics {
  stage_id: string
  name: string
  color: string
  position: number
  count: number
  value: number
  is_final?: boolean
}

export interface SellerMetrics {
  profile_id: string
  name: string
  leads_count: number
  deals_count: number
  conversion_rate: number
  avg_response_minutes: number | null
  is_available: boolean
}

export interface MonthlyData {
  month: string
  leads: number
  deals: number
}

export interface SourceIntegration {
  id: string
  company_id: string
  source_id: string
  integration_type: IntegrationType
  config: Record<string, unknown>
  is_active: boolean
  webhook_token: string | null
  created_at: string
  updated_at: string
}

export type WebhookPreset = 'meta_lead_ads' | 'google_lead_form' | 'rd_station' | 'generic'

export interface WebhookIntegrationConfig {
  preset: WebhookPreset
}

export interface WebhookInboundLog {
  id: string
  company_id: string
  source_integration_id: string | null
  source_id: string | null
  status: string
  lead_id: string | null
  raw_payload: Record<string, unknown>
  parsed_payload: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface WebhookIntegrationWithDetails extends SourceIntegration {
  lead_source_name: string
  lead_source_slug: string
  pipeline_id: string | null
  pipeline_name: string | null
}

export interface InstagramConnection {
  id: string
  company_id: string
  page_id: string
  page_name: string | null
  instagram_account_id: string
  instagram_username: string | null
  access_token: string
  token_expires_at: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface SupportTicket {
  id: string
  company_id: string | null
  user_id: string | null
  title: string
  description: string
  error_message: string | null
  error_stack: string | null
  page_url: string | null
  user_agent: string | null
  priority: TicketPriority
  status: TicketStatus
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  company_id: string
  user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type PaymentProvider = 'asaas' | 'stripe' | 'mercadopago'
export type PaymentEnvironment = 'sandbox' | 'production'

export interface PaymentConfig {
  id: string
  company_id: string
  provider: PaymentProvider
  api_key: string
  api_secret: string | null
  webhook_secret: string | null
  environment: PaymentEnvironment
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface NotificationPreferences {
  new_lead: boolean
  new_message: boolean
  lead_transferred: boolean
  system_alerts: boolean
  sound_enabled: boolean
}

export interface PersonalReport {
  assigned_leads: number
  deals_closed: number
  conversion_rate: number
  avg_response_time: number | null
  revenue: number
}

export interface LeadSourceRecord {
  id: string
  company_id: string | null
  name: string
  slug: string
  color: string
  icon_name: string
  is_active: boolean
  is_system: boolean
  created_at: string
  updated_at: string
}

export type TaskType = 'todo' | 'followup' | 'call' | 'meeting'
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface Task {
  id: string
  company_id: string
  lead_id: string | null
  assigned_to: string | null
  created_by: string | null
  type: TaskType
  title: string
  description: string | null
  status: TaskStatus
  due_date: string | null
  completed_at: string | null
  meeting_date: string | null
  meeting_duration: number | null
  meeting_link: string | null
  meeting_lead_email: string | null
  google_event_id: string | null
  created_at: string
  updated_at: string
}

export interface TaskWithRelations extends Task {
  leads?: Pick<Lead, 'id' | 'name' | 'phone'> | null
  profiles?: Pick<Profile, 'id' | 'name' | 'email'> | null
}

export type ReminderChannel = 'whatsapp' | 'email' | 'both'
export type ReminderStatus = 'pending' | 'sent' | 'edited' | 'cancelled' | 'failed'

export interface TaskReminder {
  id: string
  task_id: string
  company_id: string
  lead_id: string | null
  channel: ReminderChannel
  scheduled_at: string
  content: string
  status: ReminderStatus
  sent_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// --- Evolution API Integration ---

export interface EvolutionInboundPayload {
  company_id: string
  instance_name: string
  phone: string
  sender_name?: string
  message_id: string
  content: string
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document'
  media_url?: string
  media_mime_type?: string
  timestamp: string
  ad_context?: {
    ad_id?: string
    ad_title?: string
    source_url?: string
    ctwa_clid?: string
  }
}

export interface EvolutionInstance {
  instance_name: string
  company_id: string
  display_name: string | null
  phone_number: string | null
  status: 'connected' | 'disconnected' | 'qr_pending'
  created_at: string
}
