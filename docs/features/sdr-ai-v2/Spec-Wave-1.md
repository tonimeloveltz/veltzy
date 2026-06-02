# Spec - Onda 1: SDR Core no Veltzy

> Feature: `sdr-ai-v2` / Wave 1
> Repo: `tonimeloveltz/veltzy`
> PRD: `docs/features/sdr-ai-v2/PRD.md`
> Status: Em revisao
> Branch: `develop`

---

## 0. Pre-requisitos confirmados

| Dependencia | Status | Notas |
|---|---|---|
| Hub `POST /functions/v1/ai-complete` | Pronto | Proxy IA com validacao tenant, tool calling, registro ai_usage |
| Hub `POST /functions/v1/ai-embeddings` | Pronto | Proxy embeddings (text-embedding-3-small, 1536 dims) |
| Hub `tenant_ai_config` | Pronto | is_ai_enabled, monthly_limit_usd, current_month_spend_usd |
| Hub `ai_model_config` | Pronto | provider + model por product/feature |
| Hub `ai_usage` + `increment_ai_spend` | Pronto | Log e contabilizacao de custo |
| Veltzy WhatsApp multi-instancia | Pronto | evolution-inbound, whatsapp-send, resolve-instance |
| Veltzy SDR v1 (sdr-ai) | Pronto (sera substituido) | Scoring + auto-reply + transfer |
| Veltzy lead-inbound-handler | Pronto (sera modificado) | Dispatch para sdr-ai, sera atualizado para sdr-engine |

---

## 1. Escopo da Onda 1

### Entrega

1. **Migrations SQL** (6 tabelas + pgvector + RLS + funcoes)
2. **Edge Function `sdr-engine`** (agent harness completo)
3. **Edge Function `sdr-knowledge-ingest`** (upload, extracao, chunking, embeddings)
4. **4 tools basicas**: qualify_lead, update_lead_field, escalate_to_human, query_business_knowledge
5. **Wizard de onboarding** do Agent Profile (guiado + profundo)
6. **Upload de docs** + extracao + chunking + embeddings (via Hub /ai-embeddings)
7. **Sandbox de teste** do agente
8. **Modo full-auto** (suggest-mode fica pra Onda 3)
9. **Dashboard de metricas SDR v2** (KPIs basicos)
10. **Modificacao em lead-inbound-handler**: dispatch para sdr-engine quando aplicavel
11. **Modificacao no roteamento**: usar sdr-engine em vez de sdr-ai para pipelines com agent_profile ativo

### Fora de escopo (ondas futuras)

- Tools: schedule_meeting (Onda 2), send_payment_link (Onda 2), schedule_followup (Onda 3), end_conversation (Onda 3)
- Suggest-mode (Onda 3)
- Follow-up scheduler cron (Onda 3)
- Alertas Slack/email (Onda 4)
- Kill switch UI (Onda 4)

### Criterio de pronto

Agente conversa com lead via WhatsApp em modo full-auto. Qualifica lead (score + temperatura). Consulta knowledge base via RAG. Escala para humano quando necessario. Metricas basicas aparecem no dashboard. Admin configura Agent Profile via wizard e testa em sandbox antes de ativar.

---

## 2. Estrategia de git

- **Branch de trabalho**: `develop` (nunca main)
- **Prefixo de branches de feature**: `feat/sdr-v2-*` mergeando em develop
- **Promover para main**: somente ao final da Onda 3 ou 4, quando o agente estiver funcional ponta a ponta
- **Motivo**: clientes em main nao devem ver feature pela metade

---

## 3. Migrations SQL

### 3.1 Migration: `051_sdr_v2_schema.sql`

Cria as 6 tabelas no schema `veltzy` com RLS e indices.

**Pre-check obrigatorio antes de rodar:**
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```
Se retornar vazio, o `CREATE EXTENSION IF NOT EXISTS vector` abaixo criara. Se ja existir, e idempotente.

**Nota sobre RLS:** As funcoes helper `get_current_company_id()`, `is_super_admin()` existem no schema `veltzy` (duplicadas de `public`). Todas as policies de tabelas veltzy usam `veltzy.get_current_company_id()` e `veltzy.is_super_admin()`, seguindo o padrao existente em `010_central_migration.sql`.

```sql
-- ============================================
-- SDR AI v2 - Wave 1 Schema
-- ============================================

-- Pre-check pgvector
-- SELECT * FROM pg_extension WHERE extname = 'vector';

-- 3.1.1 agent_profiles
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

-- 3.1.2 agent_knowledge_chunks (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

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

-- 3.1.3 sdr_conversations
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

-- 3.1.4 sdr_followups
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

-- 3.1.5 sdr_tool_calls
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

-- 3.1.6 payments
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
```

### 3.2 Migration: `052_sdr_v2_functions.sql`

Funcao de busca semantica e triggers updated_at.

**Nota:** A funcao `handle_updated_at()` ja existe em `public` e `veltzy` (definida em `001_foundation.sql`). Triggers reutilizam essa funcao.

```sql
-- Busca semantica na knowledge base
CREATE OR REPLACE FUNCTION veltzy.search_knowledge_chunks(
  p_agent_profile_id uuid,
  p_query_embedding vector(1536),
  p_top_k integer DEFAULT 5,
  p_min_score float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  source_file_name text,
  metadata jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = veltzy, public
AS $$
  SELECT
    akc.id,
    akc.content,
    1 - (akc.embedding <=> p_query_embedding) AS similarity,
    akc.source_file_name,
    akc.metadata
  FROM veltzy.agent_knowledge_chunks akc
  INNER JOIN veltzy.agent_profiles ap ON ap.id = akc.agent_profile_id
  WHERE akc.agent_profile_id = p_agent_profile_id
    AND akc.knowledge_base_version = ap.knowledge_base_version
    AND 1 - (akc.embedding <=> p_query_embedding) >= p_min_score
  ORDER BY akc.embedding <=> p_query_embedding
  LIMIT p_top_k;
$$;

-- Triggers updated_at (reutiliza handle_updated_at existente)
CREATE TRIGGER trg_agent_profiles_updated_at
  BEFORE UPDATE ON veltzy.agent_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON veltzy.payments
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

### 3.3 Migration: `053_sdr_v2_storage.sql`

Bucket para docs da knowledge base.

```sql
-- Storage bucket para docs do agent
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-knowledge',
  'agent-knowledge',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: empresa so ve seus proprios arquivos
CREATE POLICY agent_knowledge_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'agent-knowledge'
    AND (storage.foldername(name))[1] = (veltzy.get_current_company_id())::text
  );

CREATE POLICY agent_knowledge_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'agent-knowledge'
    AND (storage.foldername(name))[1] = (veltzy.get_current_company_id())::text
  );

CREATE POLICY agent_knowledge_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'agent-knowledge'
    AND (storage.foldername(name))[1] = (veltzy.get_current_company_id())::text
  );
```

---

## 4. Edge Function: `sdr-engine`

### 4.1 Visao geral

Caminho: `supabase/functions/sdr-engine/`

O `sdr-engine` e o agent harness completo. Recebe uma mensagem do lead (via lead-inbound-handler) e orquestra o loop de agente: carrega contexto, chama Hub /ai-complete com tools, executa tool calls locais, repete ate resposta final ou stop condition.

### 4.2 Estrutura de arquivos

```
supabase/functions/sdr-engine/
  index.ts                    # Entry point (Deno.serve)
  agent-loop.ts               # AgentLoop: while loop canonico
  tool-registry.ts            # ToolRegistry: catalogo + dispatch
  budget-enforcer.ts          # BudgetEnforcer: limites multi-camada
  memory-manager.ts           # MemoryManager: contexto da conversa
  guardrail-checker.ts        # GuardrailChecker: validacao pos-LLM
  conversation-state.ts       # ConversationStateManager: CRUD em sdr_conversations
  hub-client.ts               # Client para Hub /ai-complete
  system-prompt-builder.ts    # Monta system prompt a partir do AgentProfile
  tools/
    qualify-lead.ts           # Tool: qualify_lead
    update-lead-field.ts      # Tool: update_lead_field
    escalate-to-human.ts      # Tool: escalate_to_human
    query-business-knowledge.ts # Tool: query_business_knowledge
```

### 4.3 Entry point (`index.ts`)

**Request body:**
```typescript
{
  leadId: string
  companyId: string
  messageContent: string
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document'
  pipelineId?: string        // opcional, resolve do lead se nao vier
  instanceName?: string      // instancia WhatsApp de origem
  isFollowup?: boolean       // true quando vem do scheduler
  followupMessage?: string   // mensagem do followup agendado
}
```

**Fluxo de alto nivel:**
1. Validar payload
2. Carregar lead (com pipeline_id, is_ai_active)
3. Carregar agent_profile do pipeline
4. Verificar condicoes de roteamento:
   - `agent_profile.is_active = true`
   - `lead.is_ai_active = true`
   - `agent_profile.operating_mode = 'full_auto'` (nesta onda)
5. Obter ou criar `sdr_conversation` ativa para o lead
6. Executar AgentLoop
7. Retornar resultado

**Response body:**
```typescript
{
  ok: boolean
  conversationId?: string
  result?: 'responded' | 'escalated' | 'budget_exceeded' | 'error'
  error?: string
}
```

### 4.4 AgentLoop (`agent-loop.ts`)

Implementa o while loop canonico do PRD (secao 6).

```typescript
interface AgentLoopParams {
  supabase: SupabaseClient
  hubClient: HubClient
  agentProfile: AgentProfile
  conversation: SdrConversation
  lead: Lead
  inboundMessage: string
  toolRegistry: ToolRegistry
  budgetEnforcer: BudgetEnforcer
  memoryManager: MemoryManager
  guardrailChecker: GuardrailChecker
  conversationState: ConversationStateManager
}

interface AgentLoopResult {
  result: 'responded' | 'escalated' | 'budget_exceeded' | 'error'
  responseSent: boolean
  totalTokens: number
  totalCostUsd: number
  iterations: number
}
```

**Pseudocodigo:**
```
1. memoryManager.appendUserMessage(inboundMessage)
2. while (!done) {
3.   budgetEnforcer.assertCanContinue(conversation)  // throws se estourou
4.   context = memoryManager.buildContext(agentProfile)
5.   response = hubClient.complete({
6.     companyId, product: 'veltzy', feature: 'sdr-engine',
7.     leadId, messages: context.messages,
8.     tools: toolRegistry.openAISchema(),
9.     system: context.systemPrompt,
10.    temperature: 0.3
11.  })
12.  conversationState.incrementIteration(response.usage)
13.  budgetEnforcer.consume(response.usage)
14.
15.  if (response.tool_calls) {
16.    for (toolCall of response.tool_calls) {
17.      result = toolRegistry.executeWithValidation(toolCall, context)
18.      // Log em sdr_tool_calls
19.      if (result.terminal) { done = true; break }
20.    }
21.    memoryManager.appendToolResults(response, results)
22.  } else {
23.    // Resposta final ao lead
24.    guardrailChecker.checkResponse(response.content, agentProfile)
25.    await sendWhatsAppMessage(lead, response.content, instanceName)
26.    memoryManager.appendAssistantMessage(response.content)
27.    done = true
28.  }
29. }
```

**Stop conditions:**
- `max_iterations_per_turn` atingido (default 10, hardcap 15)
- Token budget da conversa estourado (default 50k)
- Tool terminal chamada (escalate_to_human)
- Resposta final sem tool_calls (ciclo normal)
- Erro irrecuperavel apos 3 retries
- Hub retorna TENANT_DISABLED ou LIMIT_EXCEEDED

**Comportamento em budget exceeded:**
- Envia mensagem padrao ao lead: "Estou indisponivel no momento. Vou te conectar com alguem da equipe."
- Chama escalate_to_human com reason='limite_atingido'

### 4.5 HubClient (`hub-client.ts`)

Client tipado para o Hub /ai-complete.

```typescript
interface HubCompleteRequest {
  company_id: string
  product: 'veltzy'
  feature: string
  lead_id?: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: ToolCall[]
    tool_call_id?: string
  }>
  tools?: OpenAIToolDef[]
  max_tokens?: number
  temperature?: number
}

interface HubCompleteResponse {
  ok: boolean
  data?: {
    content: string | null
    tool_calls?: ToolCall[]
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number }
    model: string
    finish_reason: string
  }
  error?: {
    code: 'TENANT_DISABLED' | 'LIMIT_EXCEEDED' | 'PROVIDER_ERROR' | 'INVALID_REQUEST'
    message: string
  }
}
```

**Timeout:** 15s por chamada (Edge Function Supabase tem 60s totais; 3 iteracoes * 15s = 45s, folga de 15s para o resto do processamento).

**Retry:** 3 tentativas com backoff exponencial (1s, 2s, 4s) para timeout e 5xx. Sem retry para TENANT_DISABLED, LIMIT_EXCEEDED, INVALID_REQUEST. Nota: retry so ocorre se houver budget de tempo restante (nao ultrapassa os 15s por chamada, retry conta dentro do timeout da iteracao).

**Endpoint:** `POST ${HUB_URL}/functions/v1/ai-complete`

**Headers:**
```typescript
{
  'Authorization': `Bearer ${Deno.env.get('HUB_SERVICE_ROLE_KEY')}`,
  'x-veltzy-company-id': companyId,
  'Content-Type': 'application/json'
}
```

**Env vars necessarias:**
- `SUPABASE_URL`: URL do projeto Supabase (injetada automaticamente — Veltzy e Hub compartilham o mesmo projeto)
- `SUPABASE_SERVICE_ROLE_KEY`: service role key (injetada automaticamente)

### 4.6 ToolRegistry (`tool-registry.ts`)

Catalogo de tools registradas dinamicamente conforme `agent_profile.enabled_tools`.

```typescript
interface ToolDefinition {
  name: string
  description: string              // PT-BR, vai pro LLM
  schema: ZodSchema                // Validacao de argumentos
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>
}

interface ToolContext {
  supabase: SupabaseClient
  lead: Lead
  conversation: SdrConversation
  agentProfile: AgentProfile
  companyId: string
  hubClient: HubClient             // Necessario para query_business_knowledge
  isSandbox: boolean               // true = modo sandbox, tools nao alteram dados reais
}

interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  terminal?: boolean               // true = encerra o loop
}
```

**Metodos:**
- `register(tool: ToolDefinition)`: registra tool no catalogo
- `openAISchema(): OpenAIToolDef[]`: retorna schema no formato OpenAI para o LLM
- `executeWithValidation(toolCall, ctx): ToolResult`: valida com zod, executa handler, loga em sdr_tool_calls

**Populacao:** No boot do sdr-engine, registra apenas tools listadas em `agentProfile.enabled_tools`. Se tool nao esta habilitada, LLM nao a ve.

### 4.7 BudgetEnforcer (`budget-enforcer.ts`)

Limites multi-camada validados antes de cada chamada ao Hub.

```typescript
interface BudgetLimits {
  maxTokensPerConversation: number     // agent_profile.max_tokens_per_conversation (default 50k)
  maxIterationsPerTurn: number         // agent_profile.max_iterations_per_turn (default 10)
  hardCapIterations: number            // 15 (nao configuravel)
  maxToolCallsPerTurn: number          // 5 (nao configuravel nesta onda)
}
```

**assertCanContinue(conversation):** throws `BudgetExceededError` com `reason` se:
- `conversation.total_tokens_used >= maxTokensPerConversation`
- `conversation.current_iteration >= min(maxIterationsPerTurn, hardCapIterations)`
- Tool calls no turn atual >= maxToolCallsPerTurn

**Nota:** Limite mensal da empresa e validado pelo Hub (LIMIT_EXCEEDED). BudgetEnforcer cuida dos limites por conversa/turn.

### 4.8 MemoryManager (`memory-manager.ts`)

Gerencia contexto da conversa (mensagens para o LLM).

**Estrategia (Onda 1 - simplificada):**
- Carrega as ultimas 20 mensagens do lead em `veltzy.messages` (sender_type in ('lead', 'ai'))
- System prompt fixo (montado pelo SystemPromptBuilder)
- Nao implementa compressao de contexto nesta onda (fica para Onda 3+ se necessario)

**buildContext(agentProfile):**
```typescript
{
  systemPrompt: string           // System prompt completo
  messages: Array<{              // Historico formatado para OpenAI
    role: 'user' | 'assistant' | 'tool'
    content: string
    tool_calls?: ToolCall[]
    tool_call_id?: string
  }>
}
```

**Mensagens do turn atual** (tool_calls e tool results) sao mantidas em memoria (array local) e nao persistidas em `messages`. Apenas a resposta final do agente e persistida como mensagem.

### 4.9 SystemPromptBuilder (`system-prompt-builder.ts`)

Monta o system prompt a partir do AgentProfile. Estrutura:

```
## Identidade
Voce e {agent_name}, {personality_desc}. Seu tom e {tone_desc}.
{disclose_ai ? "Se perguntado, voce pode revelar que e uma IA." : "Nunca revele que e uma IA."}

## Empresa
{company_description}
Proposta de valor: {value_proposition}
{differentiators ? "Diferenciais: " + differentiators : ""}

## Seu proposito
Voce e um agente de {purpose_desc}. Seu objetivo principal: {primary_goal}.
Voce so deve tratar de assuntos relacionados a esse proposito.
Se o lead perguntar algo fora do seu escopo, reconheca educadamente e oferca transferencia para um humano.

## Perfil de cliente ideal
{ideal_customer_profile || "Nao definido."}

## Regras de comportamento
- Responda sempre em portugues brasileiro
- Seja {tone_desc} e {personality_desc}
- Nunca invente informacoes. Use a tool query_business_knowledge para consultar dados da empresa
- Nunca mencione precos que nao vieram da knowledge base
- Use a tool qualify_lead quando tiver informacao suficiente para avaliar o lead
- Use a tool update_lead_field para registrar informacoes que o lead compartilhar
- Escale para humano quando: lead pedir, assunto fora do escopo, objecao complexa

## Guardrails
{forbidden_topics.length ? "Topicos proibidos: " + forbidden_topics.join(", ") : ""}
{must_escalate_keywords.length ? "Palavras que exigem escalada imediata: " + must_escalate_keywords.join(", ") : ""}
{custom_guardrails || ""}

## Horario comercial
{business_hours_formatted}
Fora do horario comercial, informe o lead e oferca retorno no proximo horario disponivel.
```

### 4.10 GuardrailChecker (`guardrail-checker.ts`)

Validacao pos-LLM antes de enviar resposta ao lead.

**Checks implementados na Onda 1:**
1. **Preco sem source**: Regex detecta R$ ou padroes numericos com cifrao. Se knowledge base nao foi consultada no turn, loga warning (nao bloqueia nesta onda)
2. **Promessa de prazo**: Regex detecta padroes como "em X dias", "dentro de X semanas". Loga warning
3. **Keywords de escalada**: Verifica se resposta contem `must_escalate_keywords` do agent_profile. Se sim, forca escalada

**Acao padrao na Onda 1:** Warning (log). Bloqueio apenas para keywords de escalada obrigatoria.

### 4.11 ConversationStateManager (`conversation-state.ts`)

CRUD para `veltzy.sdr_conversations`.

**getOrCreateActive(leadId, pipelineId, agentProfileId, companyId):**
- Busca conversa com `status = 'active'` para o lead
- Se existe, retorna (resume conversa)
- Se nao, cria nova
- Heartbeat: se conversa ativa tem `last_activity_at` > 7 dias atras, fecha como 'abandoned' e cria nova

**incrementIteration(usage):**
- Incrementa current_iteration e total_iterations
- Soma tokens e cost
- Atualiza last_activity_at

**close(status, endReason, endSummary):**
- Atualiza status, end_reason, end_summary, ended_at

### 4.12 Envio de resposta via WhatsApp

O sdr-engine envia a resposta chamando `whatsapp-send` (Edge Function existente) internamente:

```typescript
await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseKey}`,
  },
  body: JSON.stringify({
    leadId: lead.id,
    content: responseText,
    messageType: 'text',
    senderType: 'ai',
    instanceName: resolvedInstanceName,  // pipelines.sdr_instance_name ou lead.whatsapp_instance_name
  }),
})
```

**Resolucao de instancia:** Usa `resolve-instance.ts` existente. Prioridade: `pipelines.sdr_instance_name` > `lead.whatsapp_instance_name` > `profile.default_whatsapp_instance`.

---

## 5. Edge Function: `sdr-knowledge-ingest`

### 5.1 Visao geral

Caminho: `supabase/functions/sdr-knowledge-ingest/`

Recebe upload de documento, extrai texto, faz chunking, gera embeddings via Hub e salva em `agent_knowledge_chunks`.

### 5.2 Estrutura

```
supabase/functions/sdr-knowledge-ingest/
  index.ts                    # Entry point
  extractor.ts                # Extracao de texto (PDF, DOCX, TXT, MD)
  chunker.ts                  # Chunking com overlap
```

### 5.3 Request body

```typescript
{
  agentProfileId: string
  companyId: string
  fileName: string
  fileUrl: string             // URL do Storage (assinada ou publica)
  fileMimeType: string
}
```

### 5.4 Fluxo

1. Atualizar `agent_profiles.knowledge_base_status = 'processing'`
2. Fazer fetch do arquivo pelo fileUrl
3. Extrair texto:
   - PDF: usar `pdf-parse` (esm.sh)
   - DOCX: usar `mammoth` (esm.sh)
   - TXT/MD: texto direto (UTF-8)
4. Chunking: 500 tokens por chunk, overlap de 50 tokens. Estimativa: 1 token ~= 4 chars para PT-BR
5. Para cada batch de chunks (10 por vez para nao estourar limite):
   - Chamar Hub `POST /functions/v1/ai-embeddings` com os textos
   - Receber embeddings (1536 dims)
6. Inserir chunks em `agent_knowledge_chunks` com embedding, metadata (page_number se PDF, word_count)
7. Incrementar `agent_profiles.knowledge_base_version`
8. Atualizar `agent_profiles.knowledge_base_status = 'ready'`
9. Se erro em qualquer passo: status = 'error', loga detalhes

### 5.5 Response

```typescript
{
  ok: boolean
  chunksCreated?: number
  version?: number
  error?: string
}
```

### 5.6 Limites

- Max 10 arquivos por agent_profile (validar no frontend)
- Max 10MB por arquivo (validar no Storage policy)
- Tipos aceitos: PDF, DOCX, TXT, MD

---

## 6. Tools (4 basicas)

### 6.1 qualify_lead

**Arquivo:** `tools/qualify-lead.ts`

**Schema zod:**
```typescript
z.object({
  score: z.number().min(0).max(100),
  temperature: z.enum(['cold', 'warm', 'hot', 'fire']),
  reasoning: z.string().min(10).max(500),
  detected_signals: z.array(z.enum([
    'orcamento_mencionado', 'urgencia_alta', 'autoridade_decisao',
    'necessidade_clara', 'timing_definido', 'concorrente_mencionado',
    'objecao_preco', 'objecao_timing', 'sem_interesse'
  ])).optional()
})
```

**Descricao para LLM:** "Use esta tool quando tiver informacao suficiente para qualificar o lead. score=0 sem interesse algum, score=100 lead pronto para fechar. temperature: cold=0-30, warm=31-60, hot=61-85, fire=86-100. reasoning explica brevemente o porque do score."

**Handler:**
1. Atualiza `leads.ai_score = score`, `leads.temperature = temperature`
2. Retorna `{ ok: true, data: { score, temperature } }`

**Sandbox (`ctx.isSandbox = true`):** Retorna resultado simulado sem atualizar `leads`. Resposta identica mas sem side effect no banco.

**Terminal:** false

### 6.2 update_lead_field

**Arquivo:** `tools/update-lead-field.ts`

**Schema zod:**
```typescript
z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  company_name: z.string().optional(),
  observations: z.string().max(1000).optional(),
  tags_to_add: z.array(z.string()).optional(),
  tags_to_remove: z.array(z.string()).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional()
})
```

**Descricao para LLM:** "Atualize campos do lead conforme ele compartilha informacao. Use observations para anotar contexto importante. Use tags para classificar (ex: 'b2b', 'enterprise', 'urgente'). Nao invente dados, so registre o que lead disse."

**Handler:**
1. Monta objeto de update filtrando campos undefined
2. Nao permite sobrescrever com string vazia
3. Tags: merge (add/remove) com array existente em `leads.tags`
4. Atualiza `leads` com os campos
5. Retorna `{ ok: true, data: { updatedFields: [...] } }`

**Sandbox (`ctx.isSandbox = true`):** Retorna campos que seriam atualizados sem alterar `leads`. Resposta identica mas sem side effect no banco.

**Terminal:** false

### 6.3 escalate_to_human

**Arquivo:** `tools/escalate-to-human.ts`

**Schema zod:**
```typescript
z.object({
  reason: z.enum([
    'lead_qualificado', 'fora_de_escopo', 'lead_solicitou',
    'objecao_complexa', 'pagamento_alto_valor', 'reclamacao',
    'erro_tecnico', 'limite_atingido'
  ]),
  summary: z.string().min(20).max(1000),
  recommended_action: z.string().max(200).optional(),
  urgency: z.enum(['low', 'medium', 'high']).default('medium')
})
```

**Descricao para LLM:** "Escale para humano quando: lead esta qualificado e quer falar com vendedor, pergunta sai do seu escopo, lead pede expressamente humano, objecao complexa que voce nao consegue resolver, sinal de reclamacao, ou erro tecnico. summary e um resumo da conversa para o humano se contextualizar rapidamente."

**Handler (reusa logica do sdr-ai v1 com adaptacoes):**
1. Salva summary em `leads.transfer_summary`
2. Desativa `leads.is_ai_active = false`
3. Resolve vendedor designado (lead.assigned_to ou round-robin)
4. Troca `leads.whatsapp_instance_name` para instancia do vendedor
5. Envia mensagem de transferencia ao lead (template de `pipelines.sdr_transfer_message_template`)
6. Fecha sdr_conversation com status='escalated', end_reason=reason, end_summary=summary
7. Retorna `{ ok: true, terminal: true, data: { transferredTo: vendorName } }`

**Sandbox (`ctx.isSandbox = true`):** Retorna `{ ok: true, terminal: true, data: { transferredTo: '(simulado)' } }` sem transferir, sem desativar is_ai_active, sem trocar instancia, sem enviar mensagem de transferencia.

**Terminal:** true

### 6.4 query_business_knowledge

**Arquivo:** `tools/query-business-knowledge.ts`

**Schema zod:**
```typescript
z.object({
  query: z.string().min(5).max(500),
  top_k: z.number().min(1).max(10).default(5)
})
```

**Descricao para LLM:** "Use esta tool quando precisar de informacao especifica sobre produtos, precos, FAQs, politicas, ou diferenciais que a empresa carregou. Pergunte em forma de pergunta natural ('Qual o preco do plano Pro?' ou 'Quais sao as formas de pagamento aceitas?'). Nao invente informacao, sempre consulte primeiro."

**Handler:**
1. Verifica `agentProfile.knowledge_base_status === 'ready'`. Se nao, retorna warning
2. Gera embedding da query via Hub `/ai-embeddings`
3. Chama `veltzy.search_knowledge_chunks(agentProfileId, embedding, top_k, 0.7)`
4. Se nenhum chunk com score >= 0.7, retorna `{ ok: true, data: { chunks: [], warning: 'Nenhum resultado relevante encontrado' } }`
5. Se encontrou, retorna `{ ok: true, data: { chunks: [{ content, similarity, source_file_name }] } }`

**Sandbox (`ctx.isSandbox = true`):** Executa normalmente (read-only, sem side effects). Busca na knowledge base real do agent_profile.

**Terminal:** false

---

## 7. Frontend: Wizard de Onboarding do Agent Profile

### 7.1 Localizacao

```
src/components/sdr-v2/
  agent-profile-wizard/
    AgentProfileWizard.tsx         # Container principal (stepper)
    steps/
      StepIdentity.tsx             # Nome, genero, tom, personalidade, disclose_ai
      StepCompany.tsx              # Descricao empresa, proposta valor, diferenciais, ICP
      StepPurpose.tsx              # Purpose, primary_goal, tools habilitadas (preset + custom)
      StepBehavior.tsx             # Horario comercial, limites, cadencia follow-up
      StepGuardrails.tsx           # Topicos proibidos, keywords escalada, custom guardrails
      StepKnowledge.tsx            # Upload de docs (ate 10 arquivos)
      StepReview.tsx               # Resumo + botao "Testar em Sandbox"
    hooks/
      use-agent-profile.ts         # CRUD agent_profile (React Query)
      use-knowledge-upload.ts      # Upload + trigger ingest
```

### 7.2 Modo guiado vs profundo

**Modo guiado (default, 4 steps):**
- Step 1: Identidade (nome, tom, personalidade)
- Step 2: Empresa (descricao, proposta de valor)
- Step 3: Proposito (purpose com preset de tools)
- Step 4: Review + Sandbox

Campos nao mostrados recebem defaults inteligentes:
- `agent_gender`: 'female' (se nome feminino) ou 'neutral'
- `disclose_ai`: true
- `business_hours`: seg-sex 8h-18h America/Sao_Paulo
- `followup_cadence`: [60, 1440, 4320, 10080, 20160]
- `max_iterations_per_turn`: 10
- `max_tokens_per_conversation`: 50000
- `guardrails`: vazios

**Modo profundo (7 steps):** Todos os 7 steps com todos os campos.

**Toggle:** Botao "Configuracao avancada" no wizard alterna entre modos. Dados preenchidos sao preservados.

### 7.3 Presets por purpose

Ao selecionar purpose, tools sao pre-selecionadas:

| Purpose | Tools (Onda 1) |
|---|---|
| qualification | qualify_lead, update_lead_field, escalate_to_human, query_business_knowledge |
| appointment_booking | qualify_lead, update_lead_field, escalate_to_human, query_business_knowledge |
| direct_sales | qualify_lead, update_lead_field, escalate_to_human, query_business_knowledge |
| support | update_lead_field, escalate_to_human, query_business_knowledge |
| recovery | update_lead_field, escalate_to_human, query_business_knowledge |

**Nota:** Na Onda 1, appointment_booking e direct_sales tem as mesmas tools que qualification porque schedule_meeting e send_payment_link sao Onda 2. Presets serao ampliados quando essas tools estiverem prontas.

### 7.4 Upload de docs (StepKnowledge)

- Usa `@supabase/storage-js` para upload ao bucket `agent-knowledge`
- Path: `{companyId}/{agentProfileId}/{filename}`
- Apos upload bem-sucedido, chama Edge Function `sdr-knowledge-ingest`
- Mostra progresso: upload -> processando -> pronto / erro
- Lista arquivos ja enviados com opcao de deletar
- Max 10 arquivos, max 10MB cada
- Tipos aceitos: PDF, DOCX, TXT, MD

### 7.5 Onde o wizard aparece

**Acesso:** Menu Pipeline > Configuracoes do Pipeline > aba "SDR IA v2"

Ou: componente inline no header do pipeline quando `ai_sdr_enabled=true` e nao existe agent_profile para o pipeline.

### 7.6 Service e Hook

**Service:** `src/services/agent-profile.service.ts`
```typescript
// CRUD
getAgentProfile(supabase, pipelineId): Promise<AgentProfile | null>
createAgentProfile(supabase, data): Promise<AgentProfile>
updateAgentProfile(supabase, id, data): Promise<AgentProfile>
deleteAgentProfile(supabase, id): Promise<void>

// Knowledge
getKnowledgeFiles(supabase, agentProfileId): Promise<KnowledgeFile[]>
deleteKnowledgeChunks(supabase, agentProfileId, fileName): Promise<void>
```

**Hook:** `src/hooks/use-agent-profile.ts`
- React Query para CRUD com invalidation
- Mutation para create/update/delete

**Hook:** `src/hooks/use-knowledge-upload.ts`
- Upload via Supabase Storage
- Trigger sdr-knowledge-ingest
- Polling de knowledge_base_status ate 'ready' ou 'error'

---

## 8. Frontend: Sandbox de Teste

### 8.1 Localizacao

```
src/components/sdr-v2/
  sandbox/
    AgentSandbox.tsx               # Container: chat simulado
    SandboxMessage.tsx             # Bolha de mensagem
    SandboxToolCall.tsx            # Card de tool call (nome, args, resultado)
    hooks/
      use-sandbox.ts               # Estado local do chat + chamada ao sdr-engine
```

### 8.2 Funcionamento

Interface de chat dentro do Veltzy que simula conversa com o agente. Admin digita como se fosse um lead e ve a resposta do agente.

**Implementacao:**
- Chama `sdr-engine` com flag `sandbox: true` no request body
- sdr-engine propaga `isSandbox: true` para o `ToolContext`
- Cada handler de tool verifica `ctx.isSandbox` e age conforme:
  - `qualify_lead`: retorna score mas nao atualiza `leads` no banco
  - `update_lead_field`: retorna campos que seriam atualizados mas nao altera `leads`
  - `escalate_to_human`: retorna sucesso simulado mas nao transfere, nao desativa is_ai_active, nao troca instancia
  - `query_business_knowledge`: executa normalmente (read-only, sem side effects)
- Mensagens nao sao salvas em `messages` (sdr-engine pula envio via whatsapp-send)
- Conversa nao cria `sdr_conversations` real (ConversationStateManager retorna objeto in-memory)
- Tool calls nao sao logados em `sdr_tool_calls` (retornados apenas na response para exibicao na UI)

### 8.3 UI

- Lado esquerdo: painel do Agent Profile (readonly, mostra config atual)
- Lado direito: chat simulado (input + historico)
- Abaixo de cada resposta do agente: accordion com tool calls feitos (nome, argumentos, resultado, duracao)
- Botao "Limpar conversa" para resetar
- Botao "Ativar agente" (salva `agent_profile.is_active = true`) aparece apos pelo menos 3 trocas de mensagem bem sucedidas

### 8.4 Acesso

- Step final do Wizard (StepReview.tsx tem botao "Testar em Sandbox")
- Acessivel tambem em: Pipeline > Configuracoes > SDR IA v2 > Sandbox

---

## 9. Frontend: Dashboard de Metricas SDR v2

### 9.1 Localizacao

```
src/components/sdr-v2/
  dashboard/
    SdrV2Dashboard.tsx             # Container com filtros + grid de KPIs
    SdrV2KpiCards.tsx              # Cards de metricas
    SdrV2ConversationTable.tsx     # Tabela de conversas recentes
    hooks/
      use-sdr-v2-metrics.ts        # Queries agregadas
```

### 9.2 KPIs (Onda 1)

| KPI | Query |
|---|---|
| Conversas iniciadas | COUNT(sdr_conversations) no periodo |
| Conversas ativas | COUNT(sdr_conversations WHERE status='active') |
| Taxa de qualificacao | COUNT(leads WHERE ai_score >= 60) / COUNT(conversas) |
| Escaladas para humano | COUNT(sdr_conversations WHERE status='escalated') |
| Custo total (R$) | SUM(sdr_conversations.total_cost_usd) * USD_TO_BRL |
| Custo medio por conversa (R$) | AVG(total_cost_usd) * USD_TO_BRL |
| Tokens consumidos | SUM(total_tokens_used) |
| Tool calls totais | COUNT(sdr_tool_calls) |

### 9.3 Filtros

- Periodo: hoje, 7d, 30d, 90d
- Pipeline (select entre pipelines da empresa)

### 9.4 Tabela de conversas recentes

Colunas: Lead (nome + telefone), Pipeline, Status, Iteracoes, Tokens, Custo (R$), Duracao, Ultima atividade.

Clicavel: abre detalhes da conversa com log de tool calls.

### 9.5 Acesso

- Menu lateral: "SDR IA" (novo item, abaixo de Dashboard existente)
- Visivel para roles: admin, manager

### 9.6 Service

**Service:** `src/services/sdr-v2-metrics.service.ts`
```typescript
getSdrV2Metrics(supabase, companyId, filters): Promise<SdrV2Metrics>
getSdrV2Conversations(supabase, companyId, filters): Promise<SdrV2Conversation[]>
getSdrV2ConversationDetail(supabase, conversationId): Promise<SdrV2ConversationDetail>
```

---

## 10. Modificacao em `lead-inbound-handler.ts`

### 10.1 Mudanca

Atualmente (linha 116-129), o handler verifica `lead.is_ai_active` e dispara `sdr-ai`. Deve ser alterado para:

1. Verificar se o pipeline do lead tem `agent_profile` ativo
2. Se sim, disparar `sdr-engine` em vez de `sdr-ai`
3. Se nao (pipeline sem agent_profile ou agent_profile.is_active=false), manter comportamento atual (sdr-ai v1)

### 10.2 Logica

```typescript
// Substituir bloco existente (linhas 115-129) por:

try {
  const { data: leadFull } = await supabase
    .from('leads')
    .select('is_ai_active, pipeline_id')
    .eq('id', lead.id)
    .single()

  if (leadFull?.is_ai_active) {
    // Verificar se pipeline tem agent_profile v2 ativo
    let useV2 = false
    if (leadFull.pipeline_id) {
      const { data: agentProfile } = await supabase
        .from('agent_profiles')
        .select('id, is_active')
        .eq('pipeline_id', leadFull.pipeline_id)
        .single()
      useV2 = !!agentProfile?.is_active
    }

    const targetFn = useV2 ? 'sdr-engine' : 'sdr-ai'
    const body = useV2
      ? {
          leadId: lead.id,
          companyId: params.companyId,
          messageContent: params.content,
          messageType: params.messageType,
          pipelineId: leadFull.pipeline_id,
          instanceName: params.instanceName,
        }
      : {
          leadId: lead.id,
          companyId: params.companyId,
          messageContent: params.content,
          conversationHistory: [],
        }

    fetch(`${params.supabaseUrl}/functions/v1/${targetFn}`, {
      method: 'POST',
      headers: fnHeaders,
      body: JSON.stringify(body),
    }).catch(() => {})
  }
} catch { /* best-effort */ }
```

### 10.3 Compatibilidade

- Pipelines sem agent_profile ativo continuam usando sdr-ai v1
- Migracao gradual: ativar agent_profile por pipeline conforme admin configura
- sdr-ai v1 continua existindo e funcional ate Onda 4 (quando sera deprecated)

---

## 11. Tipos TypeScript (Frontend)

### 11.1 Arquivo: `src/types/sdr-v2.ts`

```typescript
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

// --- Tool Calls ---

export type ToolCallStatus = 'success' | 'validation_failed' | 'execution_failed' | 'guardrail_blocked'

export interface SdrToolCall {
  id: string
  conversation_id: string
  iteration_number: number
  tool_name: string
  arguments: Record<string, unknown>
  result: Record<string, unknown> | null
  status: ToolCallStatus
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

// --- Metrics ---

export interface SdrV2Metrics {
  conversations_started: number
  conversations_active: number
  qualification_rate: number
  escalation_count: number
  total_cost_brl: number
  avg_cost_per_conversation_brl: number
  total_tokens: number
  total_tool_calls: number
}
```

---

## 12. Env vars necessarias

### Edge Functions (sdr-engine, sdr-knowledge-ingest)

| Var | Descricao |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (injetada automaticamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (injetada automaticamente) |

**Nota:** Veltzy e Hub compartilham o mesmo projeto Supabase (`zxefzegggntfjlfsdgvw`). Nao sao necessarias env vars adicionais como HUB_URL ou HUB_SERVICE_ROLE_KEY. `OPENAI_API_KEY` tambem NAO e necessaria no sdr-engine — toda chamada de IA passa pelo endpoint ai-complete do Hub.

---

## 13. Ordem de implementacao sugerida

| Passo | O que | Depende de |
|---|---|---|
| 1 | Migrations SQL (051, 052, 053) | Nada |
| 2 | Types TypeScript (`sdr-v2.ts`) | Nada |
| 3 | sdr-engine: hub-client.ts | SUPABASE_URL (auto-injetada) |
| 4 | sdr-engine: tool-registry.ts + 4 tools | Migrations |
| 5 | sdr-engine: budget-enforcer.ts | Nada |
| 6 | sdr-engine: memory-manager.ts | Nada |
| 7 | sdr-engine: system-prompt-builder.ts | Nada |
| 8 | sdr-engine: guardrail-checker.ts | Nada |
| 9 | sdr-engine: conversation-state.ts | Migrations |
| 10 | sdr-engine: agent-loop.ts | Steps 3-9 |
| 11 | sdr-engine: index.ts | Step 10 |
| 12 | sdr-knowledge-ingest | Migrations + Hub /ai-embeddings |
| 13 | Modificacao lead-inbound-handler | sdr-engine pronto |
| 14 | Services frontend (agent-profile, sdr-v2-metrics) | Types |
| 15 | Hooks frontend | Services |
| 16 | Wizard AgentProfileWizard (7 steps) | Hooks |
| 17 | Knowledge upload (StepKnowledge) | sdr-knowledge-ingest |
| 18 | Sandbox de teste | sdr-engine + Wizard |
| 19 | Dashboard SdrV2Dashboard | Hooks de metricas |
| 20 | Integracao no menu/rotas | Componentes prontos |

---

## 14. Riscos e mitigacoes especificos da Onda 1

| Risco | Mitigacao |
|---|---|
| pgvector nao habilitado no Supabase | Verificar se extensao vector esta disponivel antes de rodar migration. Supabase managed suporta pgvector nativamente |
| Hub /ai-complete fora ou lento | Retry com backoff no hub-client. Fallback: mensagem padrao + escalada |
| Chunking ruim (corta no meio de frase) | Implementar chunk por paragrafos/sentencas com fallback por tokens |
| Embedding batch muito grande | Processar em batches de 10 chunks. Hub /ai-embeddings aceita array |
| PDF com imagens/tabelas | pdf-parse extrai apenas texto. Avisar admin que tabelas em imagem nao sao processadas |
| Agent loop infinito | Hardcap de 15 iteracoes no BudgetEnforcer, nunca configuravel |
| sdr-ai v1 e v2 rodando simultaneamente para mesmo lead | lead-inbound-handler verifica agent_profile ativo: se existe, usa v2; se nao, v1. Nunca ambos |
| Edge Function timeout (Supabase: 60s default) | Agent loop typico faz 1-3 iteracoes. Timeout de 15s por chamada ao Hub. 3 iteracoes * 15s = 45s, folga de 15s para processamento |

---

## 15. Checklist de aceite (Definition of Done)

- [ ] Migrations aplicadas sem erro
- [ ] Agent Profile criado via wizard (modo guiado)
- [ ] Agent Profile criado via wizard (modo profundo com todos os campos)
- [ ] Upload de PDF processado e chunks salvos com embeddings
- [ ] Sandbox: conversa de 5+ mensagens com tool calls visiveis
- [ ] WhatsApp real: lead envia mensagem, agente responde via sdr-engine
- [ ] qualify_lead: lead qualificado com score e temperatura atualizados
- [ ] query_business_knowledge: agente consulta KB e usa informacao na resposta
- [ ] escalate_to_human: transferencia funciona (summary, troca instancia, notificacao)
- [ ] update_lead_field: campos do lead atualizados durante conversa
- [ ] Dashboard: KPIs basicos renderizam com dados reais
- [ ] Dashboard: tabela de conversas com drill-down em tool calls
- [ ] Budget: conversa encerra ao atingir limite de iteracoes
- [ ] Compatibilidade: pipeline sem agent_profile continua usando sdr-ai v1
- [ ] RLS: empresa A nao ve dados de empresa B (agent_profiles, conversations, tool_calls)
