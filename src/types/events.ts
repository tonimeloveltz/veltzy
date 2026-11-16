// Eventos (Fase 1). Espelha a migration do Hub 20261116100146_veltzy_eventos_fase1.sql
// coluna a coluna. O Veltzy nao gera tipos do Supabase: mudou a migration, muda aqui.

import type { DealPriority } from '@/types/database'

export type EventStatus = 'draft' | 'published' | 'closed' | 'finished' | 'canceled'
export type EventClosedReason = 'manual' | 'capacity' | 'deadline'
export type EventPublicStatus = 'open' | 'not_open' | 'sold_out' | 'closed' | 'finished' | 'canceled'
export type EventFormat = 'presencial' | 'online' | 'hibrido'
export type EventAssignmentMode = 'fixed' | 'round_robin'

export type RegistrationStatus = 'registered' | 'confirmed' | 'attended' | 'absent' | 'canceled'
export type RegistrationSource = 'public_form' | 'manual'

export type EventMessageKind =
  | 'confirmation'
  | 'reminder_d1'
  | 'post_present'
  | 'post_absent'
  | 'cancel_notice'
  | 'duplicate_resend'

export type EventMessageStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped_no_instance'
  | 'skipped_opt_out'
  | 'skipped_no_consent'
  | 'canceled'

export type FieldKind = 'fixed' | 'predefined' | 'custom'
export type FieldType =
  | 'text'
  | 'paragraph'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'email'
  | 'phone'
  | 'document'
  | 'city_state'
  | 'address'
  | 'datetime'
  | 'terms'

export type FieldKey =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'whatsapp'
  | 'company'
  | 'job_title'
  | 'phone'
  | 'document'
  | 'city_state'
  | 'address'
  | 'datetime'
  | 'terms'

export type FieldDestination = 'answer_only' | 'contact_field' | 'deal_field'
export type ContactDestinationField = 'company_name' | 'instagram_handle' | 'linkedin_url'

export interface EventFieldOption {
  id: string
  label: string
  tag: string | null
  priority: DealPriority | null
}

export interface EventAppearance {
  logo_path: string | null
  banner_path: string | null
  primary_color: string
  background_color: string
  button_text_color: string
  theme: 'light' | 'dark'
}

export interface EventMessageConfig {
  enabled: boolean
  text: string
}

export type EventMessagesConfig = Record<Exclude<EventMessageKind, 'duplicate_resend'>, EventMessageConfig>

export interface Event {
  id: string
  company_id: string
  slug: string
  title: string
  description: string | null
  category: string | null
  format: EventFormat
  venue_name: string | null
  cep: string | null
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  online_url: string | null
  starts_at: string | null
  ends_at: string | null
  timezone: string
  registration_opens_at: string | null
  registration_closes_at: string | null
  capacity: number | null
  show_remaining_spots: boolean
  status: EventStatus
  closed_reason: EventClosedReason | null
  organizer_name: string | null
  organizer_description: string | null
  organizer_contact: string | null
  privacy_policy_url: string | null
  pipeline_id: string | null
  entry_stage_id: string | null
  confirmed_stage_id: string | null
  present_stage_id: string | null
  absent_stage_id: string | null
  assignment_mode: EventAssignmentMode
  fixed_assignee_id: string | null
  rr_cursor: number
  event_tag_name: string | null
  whatsapp_session_name: string | null
  appearance: EventAppearance
  show_powered_by: boolean
  messages: EventMessagesConfig
  confirmation_page_message: string | null
  price_cents: number
  currency: string
  is_paid: boolean
  created_by: string | null
  published_at: string | null
  finished_at: string | null
  canceled_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface EventFormField {
  id: string
  company_id: string
  event_id: string
  position: number
  kind: FieldKind
  key: FieldKey | null
  type: FieldType
  label: string
  help_text: string | null
  placeholder: string | null
  required: boolean
  options: EventFieldOption[] | null
  config: Record<string, unknown> | null
  destination: FieldDestination
  destination_field: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface RegistrationAnswer {
  field_id: string
  label_snapshot: string
  type: FieldType
  value: unknown
  display: string
}

export interface EventRegistration {
  id: string
  company_id: string
  event_id: string
  lead_id: string | null
  deal_id: string | null
  public_token: string
  status: RegistrationStatus
  status_before_checkin: 'registered' | 'confirmed' | 'absent' | null
  payment_status: 'free' | 'pending' | 'paid' | 'refunded' | 'canceled'
  amount_cents: number
  first_name: string
  last_name: string | null
  email: string | null
  whatsapp: string
  answers: RegistrationAnswer[]
  ref_code: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer_url: string | null
  consent_privacy_at: string | null
  consent_marketing: boolean
  privacy_consent_id: string | null
  marketing_consent_id: string | null
  source: RegistrationSource
  created_by: string | null
  confirmed_at: string | null
  checked_in_at: string | null
  checked_in_by: string | null
  canceled_at: string | null
  canceled_by_registrant: boolean | null
  ip_hash: string | null
  user_agent: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
}

export interface EventRefCode {
  id: string
  company_id: string
  event_id: string
  code: string
  label: string
  created_at: string
  updated_at: string
}

export interface EventAssignee {
  company_id: string
  event_id: string
  user_id: string
  position: number
  created_at: string
}

export interface EventMessage {
  id: string
  company_id: string
  event_id: string
  registration_id: string
  kind: EventMessageKind
  status: EventMessageStatus
  scheduled_for: string
  sent_at: string | null
  attempts: number
  last_error: string | null
  instance_name: string | null
  provider_message_id: string | null
  rendered_text: string | null
  created_at: string
  updated_at: string
}

// --- Leitura publica (get_event_public / get_registration_public, via Edge Function) ---

export interface EventPublicVenue {
  name: string | null
  cep?: string | null
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
}

export interface EventPublicAppearance extends EventAppearance {
  logo_url: string | null
  banner_url: string | null
}

export interface EventPublicField {
  id: string
  kind: FieldKind
  key: FieldKey | null
  type: FieldType
  label: string
  help_text: string | null
  placeholder: string | null
  required: boolean
  config: { text: string | null } | null
  options: Array<{ id: string; label: string }> | null
}

export interface EventPublic {
  slug: string
  title: string
  description: string | null
  category: string | null
  format: EventFormat
  venue: EventPublicVenue | null
  starts_at: string | null
  ends_at: string | null
  timezone: string
  registration_opens_at: string | null
  registration_closes_at: string | null
  status: EventPublicStatus
  remaining_spots: number | null
  organizer: { name: string; description: string | null; contact: string | null }
  appearance: EventPublicAppearance
  show_powered_by: boolean
  privacy_policy_url: string | null
  fields: EventPublicField[]
}

export interface RegistrationPublic {
  first_name: string
  status: RegistrationStatus
  event: {
    slug: string
    title: string
    format: EventFormat
    status: EventPublicStatus
    starts_at: string | null
    ends_at: string | null
    timezone: string
    venue: EventPublicVenue | null
    online_url: string | null
    confirmation_page_message: string | null
    organizer_name: string
    appearance: EventPublicAppearance
    show_powered_by: boolean
  }
  can_confirm: boolean
  can_cancel: boolean
}

// Respostas da Edge Function event-register.
export type RegisterResult =
  | { result: 'ok'; token: string }
  | { result: 'duplicate' }
  | { result: 'sold_out' | 'closed' | 'not_open' | 'finished' | 'canceled' | 'not_found' }
  | { result: 'validation'; errors: Record<string, string> }
  | { result: 'rejected' | 'rate_limited' }
