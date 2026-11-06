-- =============================================================================
-- 051_sdr_v2_schema.sql
-- SDR AI v2 - Wave 1: Tabelas, indices, RLS
-- Tabelas: agent_profiles, agent_knowledge_chunks, sdr_conversations,
--          sdr_followups, sdr_tool_calls, payments
-- =============================================================================

-- Pre-check pgvector (rodar manualmente antes):
-- SELECT * FROM pg_extension WHERE extname = 'vector';

-- Habilitar pgvector (idempotente)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. agent_profiles (1:1 com pipeline)
-- ============================================

CREATE TABLE veltzy.agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL UNIQUE REFERENCES veltzy.pipelines(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,

  -- Identidade
  agent_name text NOT NULL,
  agent_gender text NOT NULL CHECK (agent_gender IN ('female', 'male', 'neutral')),
  tone text NOT NULL CHECK (tone IN ('formal', 'informal', 'coloquial', 'tecnico')),
  personality text NOT NULL CHECK (personality IN ('consultiva', 'objetiva', 'calorosa', 'tecnica')),
  disclose_ai boolean NOT NULL DEFAULT true,

  -- Empresa (contexto)
  company_description text NOT NULL,
  value_proposition text NOT NULL,
  differentiators text,
  ideal_customer_profile text,

  -- Proposito (compliance Meta)
  purpose text NOT NULL CHECK (purpose IN ('qualification', 'appointment_booking', 'direct_sales', 'support', 'recovery')),
  primary_goal text NOT NULL,

  -- Tools habilitadas
  enabled_tools text[] NOT NULL DEFAULT '{}',

  -- Limites
  max_iterations_per_turn integer NOT NULL DEFAULT 10,
  max_tokens_per_conversation integer NOT NULL DEFAULT 50000,
  max_payment_value_brl numeric NOT NULL DEFAULT 5000,
  operating_mode text NOT NULL DEFAULT 'full_auto' CHECK (operating_mode IN ('full_auto', 'suggest_mode')),
  business_hours jsonb NOT NULL DEFAULT '{}',

  -- Follow-up
  followup_cadence integer[] NOT NULL DEFAULT ARRAY[60, 1440, 4320, 10080, 20160],
  followup_max_attempts integer NOT NULL DEFAULT 5,

  -- Knowledge base
  knowledge_base_status text NOT NULL DEFAULT 'empty' CHECK (knowledge_base_status IN ('empty', 'processing', 'ready', 'error')),
  knowledge_base_version integer NOT NULL DEFAULT 0,

  -- Guardrails
  forbidden_topics text[] NOT NULL DEFAULT '{}',
  must_escalate_keywords text[] NOT NULL DEFAULT '{}',
  custom_guardrails text,

  -- Sistema
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_profiles_company ON veltzy.agent_profiles(company_id);
CREATE INDEX idx_agent_profiles_pipeline ON veltzy.agent_profiles(pipeline_id);

ALTER TABLE veltzy.agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_ap_select" ON veltzy.agent_profiles
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_ap_all" ON veltzy.agent_profiles
  FOR ALL TO authenticated
  USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- ============================================
-- 2. agent_knowledge_chunks (pgvector RAG)
-- ============================================

CREATE TABLE veltzy.agent_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_profile_id uuid NOT NULL REFERENCES veltzy.agent_profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  source_file_name text NOT NULL,
  source_file_url text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  knowledge_base_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_akc_embedding ON veltzy.agent_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_akc_profile ON veltzy.agent_knowledge_chunks(agent_profile_id);
CREATE INDEX idx_akc_version ON veltzy.agent_knowledge_chunks(agent_profile_id, knowledge_base_version);

ALTER TABLE veltzy.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_akc_select" ON veltzy.agent_knowledge_chunks
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_akc_all" ON veltzy.agent_knowledge_chunks
  FOR ALL TO authenticated
  USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- ============================================
-- 3. sdr_conversations
-- ============================================

CREATE TABLE veltzy.sdr_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES veltzy.leads(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES veltzy.pipelines(id),
  agent_profile_id uuid NOT NULL REFERENCES veltzy.agent_profiles(id),
  company_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'completed', 'abandoned', 'failed')),
  current_iteration integer NOT NULL DEFAULT 0,
  total_iterations integer NOT NULL DEFAULT 0,
  total_tokens_used integer NOT NULL DEFAULT 0,
  total_cost_usd numeric NOT NULL DEFAULT 0,

  end_reason text,
  end_summary text,

  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX idx_sdr_conv_lead ON veltzy.sdr_conversations(lead_id);
CREATE INDEX idx_sdr_conv_company ON veltzy.sdr_conversations(company_id);
CREATE INDEX idx_sdr_conv_active ON veltzy.sdr_conversations(status) WHERE status = 'active';
CREATE INDEX idx_sdr_conv_profile ON veltzy.sdr_conversations(agent_profile_id);

ALTER TABLE veltzy.sdr_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_sdr_conv_select" ON veltzy.sdr_conversations
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_sdr_conv_all" ON veltzy.sdr_conversations
  FOR ALL TO authenticated
  USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- ============================================
-- 4. sdr_followups
-- ============================================

CREATE TABLE veltzy.sdr_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES veltzy.sdr_conversations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  company_id uuid NOT NULL,

  attempt_number integer NOT NULL,
  scheduled_for timestamptz NOT NULL,
  message text NOT NULL,
  reasoning text NOT NULL,
  cancel_if_lead_responds boolean NOT NULL DEFAULT true,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdr_followups_pending ON veltzy.sdr_followups(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_sdr_followups_lead ON veltzy.sdr_followups(lead_id);

ALTER TABLE veltzy.sdr_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_sdr_fu_select" ON veltzy.sdr_followups
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_sdr_fu_all" ON veltzy.sdr_followups
  FOR ALL TO authenticated
  USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- ============================================
-- 5. sdr_tool_calls
-- ============================================

CREATE TABLE veltzy.sdr_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES veltzy.sdr_conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  iteration_number integer NOT NULL,

  tool_name text NOT NULL,
  arguments jsonb NOT NULL,
  result jsonb,
  status text NOT NULL CHECK (status IN ('success', 'validation_failed', 'execution_failed', 'guardrail_blocked')),
  error_message text,

  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdr_tool_calls_conv ON veltzy.sdr_tool_calls(conversation_id);

ALTER TABLE veltzy.sdr_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_sdr_tc_select" ON veltzy.sdr_tool_calls
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_sdr_tc_all" ON veltzy.sdr_tool_calls
  FOR ALL TO authenticated
  USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- ============================================
-- 6. payments
-- ============================================

CREATE TABLE veltzy.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES veltzy.leads(id),
  conversation_id uuid REFERENCES veltzy.sdr_conversations(id),
  company_id uuid NOT NULL,

  asaas_charge_id text NOT NULL UNIQUE,
  amount_brl numeric NOT NULL,
  description text NOT NULL,
  payment_methods text[] NOT NULL,
  due_date date NOT NULL,
  payment_url text NOT NULL,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'overdue', 'cancelled', 'refunded')),
  paid_at timestamptz,

  generated_by text NOT NULL CHECK (generated_by IN ('sdr_ai', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_lead ON veltzy.payments(lead_id);
CREATE INDEX idx_payments_status ON veltzy.payments(status);
CREATE INDEX idx_payments_company ON veltzy.payments(company_id);

ALTER TABLE veltzy.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_pay_select" ON veltzy.payments
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_pay_all" ON veltzy.payments
  FOR ALL TO authenticated
  USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());
