# SPECS - Veltzy Technical Foundation

> **Specs de features** (detalhados, por feature):
> - Mensagens Template / HSM (WhatsApp Cloud API): [`docs/features/whatsapp-templates/Spec.md`](features/whatsapp-templates/Spec.md) (PRD: [`PRD-templates.md`](features/whatsapp-templates/PRD-templates.md))

## 1. STACK TECNOLOGICA

### Frontend
- **Framework:** React 18 + Vite 5 + TypeScript 5
- **Roteamento:** React Router DOM v6 com `ProtectedRoute`
- **UI:** Tailwind CSS v3 + shadcn/ui + Radix UI + Lucide Icons
- **State Management:** TanStack React Query v5 (staleTime 5m, gcTime 10m, retry 1)
- **Drag & Drop:** dnd-kit (pipeline kanban)
- **Charts:** Recharts (dashboard analitico)
- **Animacoes:** framer-motion (`PageTransition`)
- **Notificacoes:** sonner (toasts)
- **Forms:** react-hook-form + zod

### Backend (Supabase)
- **Auth:** Supabase Auth (email/password) + recuperacao de senha
- **Database:** PostgreSQL com RLS multi-tenant
- **Realtime:** Supabase Realtime (chat, notificacoes, presenca)
- **Storage:** Bucket `chat-attachments` para midias
- **Edge Functions:** Deno runtime (10 functions deployadas)
- **IA:** Chaves proprias do cliente (OpenAI/Gemini) via Edge Function `sdr-ai`

## 2. SCHEMA DO BANCO (MULTI-TENANT)

Todas as tabelas de dominio possuem `company_id` para isolamento via RLS.

### Tabelas Principais

| Tabela | Descricao |
|---|---|
| `companies` | Tenant principal: `features` (JSONB), `settings`, `primary_color`, `secondary_color`, `logo_url`, `slug`, `is_active` |
| `profiles` | Vinculados a `auth.users` via `user_id`, com `company_id`, `is_available`, `last_seen_at` |
| `user_roles` | Roles separadas em tabela propria (super_admin, admin, manager, seller) -- previne escalada de privilegios |
| `leads` | `ai_score`, `temperature` (cold/warm/hot/fire), `stage_id`, `source_id`, `assigned_to`, `tags[]`, `deal_value`, `observations`, `is_ai_active`, `is_queued`, `conversation_status`, `ad_context` (Meta Ads) |
| `messages` | Chat com `sender_type` (ai/human/lead), `message_type`, `file_url`, `file_mime_type`, `file_name`, `source`, `replied_message_id`, `is_scheduled`, `scheduled_at` |
| `pipeline_stages` | Fases dinamicas por empresa: `position`, `color`, `is_final`, `is_positive`, `slug` |
| `lead_sources` | Origens customizaveis por empresa: `slug`, `icon_name`, `color`, `is_system`, `is_active` |
| `source_integrations` | Configuracao tecnica por origem: `integration_type`, `config` (JSONB) |
| `pipeline_sources` | Mapeamento N:N entre `pipeline_stages` e `lead_sources` |
| `goals` | Metas comerciais: `title`, `cycle_type` (monthly/sprint/custom), `start_date`, `end_date`, `is_active`, `visible_to_sellers` |
| `goal_metrics` | Metricas por meta: `metric_type`, `target_value`, `applies_to` (team/individual), `profile_id` |
| `automation_rules` | `trigger_type`, `conditions`, `action_type`, `action_data`, `priority`, `is_enabled` |
| `automation_logs` | Historico de execucao com `old_value` e `new_value` |
| `notifications` | Alertas persistentes por usuario: `type`, `action_type`, `action_data`, `is_read` |
| `reply_templates` | Templates de resposta rapida categorizados |
| `whatsapp_configs` | Instancia Z-API por empresa: `instance_id`, `instance_token`, `client_token`, `qr_code`, `status` |
| `instagram_connections` | OAuth tokens: `access_token`, `page_id`, `instagram_account_id`, `token_expires_at` |
| `system_settings` | Configuracoes dinamicas chave/valor por empresa (tema, SDR, business rules, **auto_reply_config**) |
| `support_tickets` | Tickets com `error_message`, `error_stack`, `page_url`, `user_agent`, `priority`, `status` |
| `activity_logs` | Auditoria: `action`, `resource_type`, `resource_id`, `user_id`, `metadata` |
| `company_invites` | Convites por email com `invite_code`, `expires_at`, `role`, `company_config` |

### Enums

- `app_role`: `admin | seller | manager | super_admin`
- `lead_source`: `whatsapp | instagram | linkedin | manual`
- `lead_status`: `new | qualifying | open | deal | lost`
- `lead_temperature`: `cold | warm | hot | fire`
- `conversation_status`: `unread | read | replied | waiting_client | waiting_internal | resolved`
- `integration_type`: `manual | webhook | whatsapp_api | instagram_api | linkedin_api`
- `sender_type`: `ai | human | lead`
- `metric_type`: `revenue | deals_closed | leads_attended | conversion_rate | avg_response_time`

### Funcoes RPC

- `has_role(_user_id, _role)` -- verifica role especifica
- `is_super_admin()` -- checa role super_admin
- `is_company_admin()` -- checa admin do tenant atual
- `is_admin_or_manager()` -- checa admin ou manager
- `is_manager_or_admin(_user_id)` -- variante com user_id
- `belongs_to_company(_company_id)` -- valida pertencimento
- `get_current_company_id()` -- retorna company_id do usuario logado
- `get_current_profile_id()` -- retorna profile.id do usuario logado
- `can_create_company()` -- valida criacao de novo tenant
- `accept_invite(p_invite_code, p_user_id)` -- aceita convite e vincula usuario
- `remove_user_from_company(p_target_user_id)` -- desvincula usuario
- `get_seller_avg_response_times(_company_id, _start_date)` -- metrica de tempo de resposta

## 3. EDGE FUNCTIONS

| Funcao | Responsabilidade |
|---|---|
| `zapi-webhook` | Recebe mensagens WhatsApp via Z-API + dispara distribuicao + auto-reply + IA SDR |
| `zapi-send` | Envia mensagens via Z-API (texto, imagem, audio, video, documento) |
| `instagram-webhook` | Recebe mensagens Instagram via Graph API |
| `instagram-send` | Envia mensagens via Instagram Graph API |
| `instagram-oauth` | Fluxo OAuth para conectar conta Instagram Business |
| `source-webhook` | Webhook generico para landing pages e formularios |
| `whatsapp-manager` | Gerenciamento de instancias Z-API (criar/conectar/desconectar) |
| `sdr-ai` | Qualificacao automatica via IA (score + temperatura + resposta) |
| `run-automations` | Execucao server-side de regras de automacao |
| `distribute-queue` | Heartbeat (2 min) que reprocessa fila de leads nao distribuidos |

## 4. ROTAS DA APLICACAO

| Rota | Componente | Acesso |
|---|---|---|
| `/auth` | `AuthPage` | Publico |
| `/update-password` | `UpdatePasswordPage` | Autenticado (sem empresa) |
| `/onboarding` | `OnboardingPage` | Autenticado (sem empresa) |
| `/` | `DashboardPage` | Autenticado com empresa |
| `/pipeline` | `PipelinePage` | Autenticado |
| `/inbox` | `InboxPage` | Autenticado |
| `/deals` | `DealsPage` | Autenticado |
| `/gestao` | `GestaoPage` | Manager/Admin |
| `/minha-conta` | `MinhaContaPage` | Autenticado |
| `/admin` | `AdminPage` | Admin |
| `/company` | `CompanyPage` | Admin |
| `/super-admin` | `SuperAdminPage` | Super Admin |
| `/sellers` | Redirect -> `/gestao?tab=vendedores` | -- |
| `/settings` | Redirect -> `/` | -- (desativada) |
| `*` | `NotFoundPage` | -- |

## 5. HOOKS

### Auth/Org
`useAuth`, `useAuthInit`, `useCompany`, `useRoles`, `useSuperAdmin`, `useProfile`

### Realtime
`useRealtimeHub` (canal central para chat, notificacoes, presenca)

### Leads e Pipeline
`useLeads`, `useLeadSources`, `usePipelineStages`, `useConversationList`, `useFallbackOwner`, `useImportLeads`

### Mensagens e Chat
`useMessages`, `useTypingIndicator`, `useReplyTemplates`

### Vendedores e Equipe
`useSellers`, `useTeam`, `useTeamMembers`

### Metas Comerciais
`useGoals`, `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`

### Dashboard e Metricas
`useDashboardMetrics`, `useSdrMetrics`, `usePersonalReport`

### Notificacoes
`useNotifications`, `useNotificationPreferences`

### Integracoes
`useWhatsAppConfig` (via `use-source-integrations`), `useSourceIntegrations`

### Automacoes
`useAutomationRules`, `useAutomationLogs`

### Config e Tema
`useThemeConfig`, `useSdrConfig`, `usePaymentConfigs`

### Suporte e Logs
`useSupportTickets`, `useActivityLogs`

## 6. SERVICES

| Service | Dominio |
|---|---|
| `auth.service.ts` | Autenticacao e sessao |
| `leads.service.ts` | CRUD de leads, filtros, movimentacao |
| `messages.service.ts` | Mensagens do chat |
| `pipeline.service.ts` | Fases do pipeline |
| `lead-sources.service.ts` | Origens de lead |
| `goals.service.ts` | Metas comerciais e metricas |
| `dashboard.service.ts` | Metricas do dashboard |
| `sdr.service.ts` | Configuracao IA SDR |
| `sdr-metrics.service.ts` | Metricas do SDR |
| `automations.service.ts` | Regras de automacao |
| `team.service.ts` | Membros da equipe |
| `company.service.ts` | Dados da empresa |
| `profile.service.ts` | Perfil do usuario |
| `roles.service.ts` | Roles e permissoes |
| `notifications.service.ts` | Notificacoes |
| `reply-templates.service.ts` | Templates de resposta |
| `source-integrations.service.ts` | Integracoes por origem |
| `whatsapp.service.ts` | Config WhatsApp/Z-API |
| `payments.service.ts` | Configuracao de pagamento |
| `personal-reports.service.ts` | Relatorios pessoais |
| `activity-logs.service.ts` | Logs de auditoria |
| `support.service.ts` | Tickets de suporte |
| `super-admin.service.ts` | Funcoes super admin |
| `import-leads.service.ts` | Importacao de leads via CSV (batch insert, validacao, duplicatas) |

## 7. SEGURANCA (RLS)

- RLS habilitado em **todas** as tabelas multi-tenant
- Padrao de policy: `company_id = get_current_company_id() OR is_super_admin()`
- Roles armazenadas em tabela propria (`user_roles`) -- **nunca** em `profiles` (previne privilege escalation)
- Funcoes `SECURITY DEFINER` com `search_path = public` para evitar recursao em RLS
- Storage com policies por `company_id` no path

## 8. TRIGGERS AUTOMATICOS

| Trigger | Funcao |
|---|---|
| `handle_new_user` | Cria `profile` + role `seller` ao cadastrar via Supabase Auth |
| `assign_admin_role_on_first_company` | Promove primeiro usuario da empresa a `admin` |
| `create_default_pipeline_for_company` | Cria 6 fases padrao ao criar empresa |
| `create_default_lead_sources_for_company` | Cria origens padrao (WhatsApp, Instagram, Manual/Webhook) |
| `create_default_settings_for_company` | Cria tema, SDR config e business rules padrao |

## 9. FLUXO DE DISTRIBUICAO DE LEADS

```
Lead novo (zapi-webhook / instagram-webhook / source-webhook)
  |-- Vendedores online? -> Round Robin simples
  |-- Ninguem online?
  |   |-- Auto-Reply habilitado + horario/dia valido? -> Envia mensagem automatica
  |   |-- Manager online? -> Atribui ao manager
  |       |-- Fallback configurado (admin OU manager)? -> Atribui ao fallback
  |           |-- Ninguem? -> Lead vai para fila (is_queued = true)
  |-- Heartbeat (distribute-queue, 2 min) reprocessa fila

IA SDR (se habilitada): processa qualificacao ANTES da distribuicao
Trocas entre vendedores: APENAS MANUAIS pelo gestor
```

## 10. STORAGE

- **Bucket:** `chat-attachments`
- **Estrutura:** `{company_id}/{lead_id}/{filename}`
- **Tipos suportados:** imagem, audio, video, documento (PDF, DOC, etc.)
- **Upload:** componente `ChatMediaUpload`

## 11. REALTIME (CANAIS)

Hub central via `useRealtimeHub`:
- `messages` -- novas mensagens no chat
- `leads` -- atualizacoes em leads (status, atribuicao, stage)
- `notifications` -- alertas para usuarios
- `typing_{lead_id}` -- indicador de digitacao por conversa
- `presence` -- status online dos vendedores

## 12. WHITE-LABEL

- Tema claro/escuro/sand por usuario (`ThemeToggle`, `ThemeInitializer`)
- Cores primaria/secundaria por empresa (HSL via design tokens)
- Logo personalizado por empresa
- Estilos de card e sidebar customizaveis (`useThemeConfig`)
- Sem branding de plataforma terceira na interface do cliente

## 13. CONFIGURACOES (`system_settings`)

Configuracoes chave/valor por empresa:
- `theme_config` -- cores, logo, estilos visuais
- `sdr_config` -- modelo IA, prompt, comportamento
- `business_rules` -- regras de fallback e distribuicao
- `auto_reply_config` -- mensagem automatica fora do horario
- `webhook_config` -- webhooks de saida
- `payment_config` -- configuracoes de pagamento

## 14. FEATURE FLAGS (`companies.features`)

| Flag | Descricao |
|---|---|
| `whatsapp_enabled` | Habilita integracao WhatsApp |
| `instagram_enabled` | Habilita integracao Instagram |
| `ai_sdr_enabled` | Habilita IA SDR |
| `custom_pipeline` | Permite customizar pipeline |
| `export_reports` | Permite exportar relatorios |
| `automation_rules` | Habilita modulo de automacoes |
| `max_users` | Limite de usuarios da empresa |
| `max_leads` | Limite de leads da empresa |

## 15. SUPER ADMIN (Daxen Labs)

- Acesso global em `/super-admin`
- Impersonacao de qualquer empresa via seletor
- Dashboard de tickets de suporte de todos os tenants (`SupportTicketsDashboard`)
- Gestao de convites globais (`SuperAdminInvitesDashboard`)
- Bypass automatico de RLS via `is_super_admin()`

## 16. PADROES NAO-FUNCIONAIS

- **Fuso horario:** `America/Sao_Paulo`
- **Idioma:** Portugues (Brasil)
- **Responsivo:** Suporte mobile via `use-mobile`
- **Skeletons de carregamento:** Dashboard, Pipeline, Chat, ConversationList
- **Transicoes:** `PageTransition` entre rotas
- **Celebracao visual:** confetti ao fechar negocio (`celebration.ts`)
- **Reporte de erros:** `ErrorReportButton` em toda a interface

## 17. FEATURE SPECS

| Feature | Spec |
|---|---|
| Multiplos Pipelines | [docs/features/multiplos-pipelines/Spec.md](features/multiplos-pipelines/Spec.md) |
| Acoes em Massa (Bulk Actions) | [docs/features/bulk-actions/Spec.md](features/bulk-actions/Spec.md) |
