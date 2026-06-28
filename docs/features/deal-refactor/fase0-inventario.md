# Fase 0 — Inventário Contato vs Negócio (READ-ONLY)

Mapeamento de TODO consumidor (leitura/escrita) dos 4 campos de negócio que hoje
vivem em `veltzy.leads` e migrarão para `veltzy.deals`:
`stage_id`, `pipeline_id`, `status`, `deal_value`.

> Nota: o doc de referência `29-arquitetura-contato-negocio.md` (seções 4/10/11) não
> está no working tree nem em nenhuma ref git/filesystem. Existe só a branch
> `feature/deal-ui-contato-negocio`. Este inventário foi feito pelo objetivo explícito
> da tarefa. Inventário de banco feito a partir das migrations (autoritativas para o
> que foi aplicado); nada foi consultado no banco vivo.

---

## 1. Inventário Frontend (por campo × consumidor × lê/escreve × fluxo)

### `stage_id`

| Arquivo:linha | L/E | Fonte | Fluxo |
|---|---|---|---|
| services/leads.service.ts:108 | LÊ (filtro) | leads | `getLeadsByCompany` filtro por stage |
| services/leads.service.ts:206 | LÊ | pipeline_stages | `createLeadWithDeal` deriva status do estágio |
| services/leads.service.ts:223 | **ESCREVE** | leads (via createLead) | criação manual de lead |
| services/leads.service.ts:268 | **ESCREVE** | leads | `moveLeadToStage` (legado, ver §6) |
| services/leads.service.ts:285 | **ESCREVE** | leads | `updateDealValueAndMove` (legado) |
| services/leads.service.ts:367,386 | **ESCREVE** | leads | `moveLeadToPipeline`/`bulkMoveToPipeline` |
| services/deals.service.ts:44,114,137,260,283 | LÊ/**ESCREVE** | deals | filtros + move/update de deal (já em deals) |
| services/dashboard.service.ts:225,238-245,389,404,419 | LÊ | deals | pipeline overview + taxas históricas (já em deals) |
| services/messages.service.ts:79 | LÊ | RPC get_conversation_list | mapper do inbox (contrato externo) |
| components/pipeline/edit-lead-modal.tsx:98,106-107,121 | **ESCREVE** | leads + deals | modal editar (dual-write, ver §6) |
| components/pipeline/create-lead-modal.tsx:31,66,76,84,87,101,126 | **ESCREVE** | leads+deals | modal Novo Lead |
| components/pipeline/deal-card.tsx:29,177,261 | LÊ | deals | card do kanban |
| components/pipeline/lead-card.tsx:30,162,244 | LÊ/escreve | leads | **DEAD CODE** (não renderizado, ver §6) |
| components/pipeline/pipeline-board.tsx:131-149,184-185 | LÊ | deals | agrupar deals por stage |
| components/dashboard/{bottleneck-detector,forecast-card,pipeline-overview*}.tsx | LÊ | deals | já em deals |
| components/dashboard/{follow-up-tips,next-actions-card}.tsx:16,44,55,67 | LÊ | leads | dicas/próximas ações (lê stage do lead) |
| lib/forecast.ts:12,30-66 | LÊ | deals | forecast |
| hooks/use-leads.ts:118,149 | **ESCREVE** (cache) | leads | optimistic update dos hooks legados |
| hooks/use-deals.ts:130,157 | ESCREVE (cache) | deals | optimistic update kanban |
| import-leads.service.ts:91-97,228,306,314 | **ESCREVE** | leads+deals | import CSV |
| lib/csv-parser.ts:96-116,143 | — | — | mapeamento de colunas CSV |
| components/admin/automation-rule-modal.tsx:92 | ESCREVE (config) | automation_rules | regra "mudar estágio" (grava ação) |
| pages/deals.tsx:142,365 | LÊ | deals | página Negócios |

### `pipeline_id`

| Arquivo:linha | L/E | Fonte | Fluxo |
|---|---|---|---|
| services/leads.service.ts:105,158,224 | LÊ/**ESCREVE** | leads | filtro + criação |
| services/leads.service.ts:357,367,378,386 | **ESCREVE** | leads | move/bulk move pipeline (legado) |
| services/deals.service.ts (vários) | LÊ/ESCREVE | deals | filtros + move (já em deals) |
| services/dashboard.service.ts (todos os blocos) | LÊ (filtro) | leads **e** deals | quase toda métrica filtra por pipeline em ambas as tabelas |
| create-lead-modal / create-deal-modal / edit-lead-modal | **ESCREVE** | leads+deals | modais |
| inbox/chat-header.tsx:30, inbox/lead-deals-panel.tsx:44-53 | LÊ | leads/deals | nome do pipeline + fechar deal |
| import-leads.service.ts:93,229,322 | **ESCREVE** | leads | import |
| services/sdr-v2-metrics.service.ts:54,70,128 | LÊ (filtro) | sdr_conversations | métricas SDR |
| agent-profile / pipeline-access / source-integrations | LÊ/ESCREVE | outras tabelas | não é leads (pipeline como FK em config) |

> `pipeline_id` é também FK/escopo em muitas tabelas-satélite (agent_profiles,
> pipeline_sources, user_pipeline_access, sdr_conversations). Migração foca só nos
> usos que leem/escrevem `leads.pipeline_id` (linhas em leads.service + modais + import).

### `status` (enum `lead_status`: new/qualifying/open/deal/lost; + 'archived')

| Arquivo:linha | L/E | Fonte | Fluxo |
|---|---|---|---|
| services/leads.service.ts:321 | **ESCREVE** | leads | `bulkArchive` (status='archived') |
| services/messages.service.ts:80 | LÊ | RPC get_conversation_list | mapper inbox (expõe leads.status) |
| services/personal-reports.service.ts:10,15 | LÊ | **leads** | relatório pessoal: filtra `status==='deal'` ⚠️ |
| lib/export-leads.ts:12,111 | LÊ | leads | export CSV |
| types/database.ts:192 (LeadStatus), UpdateLeadInput.status:246 | tipo | — | contrato de tipo |
| (trigger) sync_lead_status_from_stage | **ESCREVE** | leads | grava status a partir do stage (ver §4) |
| import-leads.service.ts:306,314 | **ESCREVE** | leads | grava status derivado do stage |

> Nenhum componente UI escreve `leads.status` diretamente; quem escreve é o **trigger**
> (mudança de stage), o **import** e o **bulkArchive**. Toda a UI de status (won/lost/
> pending) no kanban/Negócios/inbox já lê de **deals.status**.

### `deal_value`

| Arquivo:linha | L/E | Fonte | Fluxo |
|---|---|---|---|
| services/leads.service.ts:222 | LÊ→escreve | leads→deals | createLeadWithDeal copia p/ deals.value |
| services/leads.service.ts:285 | **ESCREVE** | leads | updateDealValueAndMove (legado) |
| services/messages.service.ts:88 | LÊ | RPC get_conversation_list | mapper inbox |
| services/personal-reports.service.ts:10,17 | LÊ | **leads** | soma receita ⚠️ |
| lib/export-leads.ts:9,108 | LÊ | leads | export CSV |
| components/pipeline/edit-lead-modal.tsx:97,120,133 | **ESCREVE** | leads + deals | dual-write |
| components/pipeline/create-lead-modal.tsx:34,129,273 | **ESCREVE** | leads→deals | modal |
| components/pipeline/lead-card.tsx:29,167,256-258 | LÊ | leads | **DEAD CODE** |
| components/pipeline/pipeline-board.tsx:162, pages/deals.tsx:143 | LÊ (map) | deals | monta objeto lead-like a partir do deal |
| import-leads.service.ts:136,227,317 | **ESCREVE** | leads+deals | import |
| admin/business-rules-tab + use-business-rules | config | business_rules | flag `require_deal_value` (não é o campo) |

---

## 2. RPCs do banco (schema veltzy)

Das 23 funções `veltzy.*`, só **1 RPC** retorna campos de negócio do lead ao cliente:

- **`get_conversation_list`** — def. atual `migrations/047_conversation_list_evolution_fields.sql:8`
  (histórico: 014 → 021 → 023 → 030 → 047). Retorna do lead: **`stage_id`** (l.54-ish),
  **`status`**, **`deal_value`** (+ temperature, ai_score etc). **NÃO** retorna pipeline_id.
  → **Contrato externo**: consumido por `messages.service.ts:getConversationList`
  (mapper §1). Mudar o shape quebra o inbox.

Funções-trigger que tocam os campos (ver §4): `sync_lead_status_from_stage`,
`log_lead_activity`, `set_deal_status_on_stage_change`, `validate_deal_stage_pipeline`.

RPCs que NÃO tocam os 4 campos: handle_updated_at, get_current_company_id,
get_current_profile_id, is_super_admin, is_company_admin, is_admin_or_manager,
handle_new_message, log_availability_change, create_default_pipeline,
create_default_sources, create_default_settings, ensure_single_default_pipeline,
check_stage_has_leads, search_knowledge_chunks, compute_lead_temperature,
get_seller_avg_response_times.

> Confirmar no Dashboard com (read-only):
> `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE pronamespace='veltzy'::regnamespace ORDER BY proname;`
> e `pg_get_functiondef` nas candidatas — para garantir que o banco vivo bate com as migrations.

---

## 3. Edge functions (Deno)

**ESCREVEM** campo de negócio em `leads` (críticas para Fase 1):

| Função | Arquivo:linha | Escreve |
|---|---|---|
| Inbound compartilhado | `_shared/lead-inbound-handler.ts:~418-419` | `pipeline_id`, `stage_id` (na criação do lead) |
| Automações | `run-automations/index.ts:~85` | `stage_id` (ação `change_stage`) |
| Instagram | `instagram-webhook/index.ts:~72-73` | `pipeline_id`, `stage_id` (criação) |

> `source-webhook` e `evolution-inbound` escrevem via `lead-inbound-handler` (delegam).
> A criação de **deal** correspondente já é feita pelo handler (`createDealForLead`).

**LEEM** (impacto menor, contexto IA/analytics):
- `sdr-ai/index.ts:~266` — lê `deal_value`, `pipeline_id` (contexto do prompt).
- `ai-copilot/index.ts:~202,397` — lê `deal_value`, `stage_id` (analytics/pulse).
- `sdr-engine/tools/escalate-to-human.ts:~73,98` — lê `pipeline_id` (resolução template).

Nenhuma edge function escreve `leads.status` ou `leads.deal_value`.

---

## 4. Triggers e constraints

### Triggers em `veltzy.leads` (def. central `migrations/010_central_migration.sql:453-455`)
- **`on_lead_stage_changed`** — `BEFORE UPDATE OF stage_id` → `sync_lead_status_from_stage()`
  (010:340). **Escreve `leads.status`** (deal/lost) quando entra em stage final; reabre p/
  'open' se sair. → É o motivo de `leads.status` "se manter sozinho".
- **`on_lead_activity`** — `AFTER INSERT OR UPDATE` → `log_lead_activity()`
  (def. atual `033_bulk_actions_archived_status.sql:8`). **Lê** stage_id e status p/ gravar
  activity_logs (`stage_changed`, `status_changed`).
- **`on_leads_updated`** — `BEFORE UPDATE` → `handle_updated_at()`.

> (As triggers de `003_leads_pipeline.sql` são da tabela antiga `public.leads`, pré-schema
> veltzy; não são as ativas.)

### Triggers em `veltzy.deals`
- **`trg_deal_status_on_stage_change`** — `BEFORE UPDATE` → `set_deal_status_on_stage_change()`
  (062:13). Escreve `status` (won/lost) e `closed_at` ao mover p/ stage final; limpa ao reabrir.
  **Só no UPDATE** — não dispara no INSERT.
- **`trg_validate_deal_stage_pipeline`** — `BEFORE INSERT OR UPDATE` → valida que
  `stage_id` pertence ao `pipeline_id` (059:50). Levanta exceção se inconsistente.
- **`set_deals_updated_at`** — `BEFORE UPDATE` → handle_updated_at.

### Constraint `idx_deals_unique_active_per_pipeline` (065)
```sql
CREATE UNIQUE INDEX idx_deals_unique_active_per_pipeline
ON veltzy.deals (lead_id, pipeline_id)
WHERE status IN ('open', 'pending_assignment');
```
Atua **só** em `open`/`pending_assignment`: 1 contato não pode ter 2 deals ATIVOS no
mesmo pipeline. Deals `won`/`lost`/`archived` não entram no índice (pode haver vários).

---

## 5. SDR e Dashboard — dependência de `leads`

### SDR
**Não ramifica por `leads.stage_id` nem `leads.status`.** O SDR decide por:
`leads.is_ai_active`, `agent_profiles.is_active`, feature flags (`sdr_agent_v2`,
`ai_sdr_enabled`), `leads.assigned_to` e `leads.pipeline_id` (só p/ carregar o agent
profile). Lê `deal_value`/`pipeline_id` apenas como contexto do prompt, sem condicional.
→ **SDR é neutro para a migração dos 4 campos.**

### Dashboard
Quase tudo **já lê de `deals`** (conversão, KPIs, pipeline overview, taxas históricas,
performance de vendedores, forecast, gargalos). Ainda dependem de `leads`:
- **`personal-reports.service.ts:10,15-17`** ⚠️ — filtra `leads.status==='deal'` e soma
  `leads.deal_value`. **Único service de métrica que ainda lê negócio de leads.**
- `lib/export-leads.ts:9-12,108-111` — export CSV inclui `leads.status`/`deal_value`.
- `dashboard/{follow-up-tips,next-actions-card}.tsx` — leem `leads.stage_id` (dicas).
- Vários blocos do `dashboard.service.ts` filtram `leads.pipeline_id` e contam leads por
  fonte/mês — uso legítimo de leads (contato), não de negócio.

---

## 6. Avaliação de risco por consumidor

### Contrato externo (mudar quebra outra camada) — risco ALTO
- **RPC `get_conversation_list` + `messages.service.ts` mapper**: expõe stage_id/status/
  deal_value do lead ao inbox. Migrar exige mudar RPC **e** mapper **e** o que o inbox faz
  com esses campos juntos. Tratar como contrato versionado.

### Escrita em `leads` (precisa parar de escrever na Fase 1) — risco ALTO
- `lead-inbound-handler.ts`, `instagram-webhook`, `run-automations` (edge): escrevem
  stage_id/pipeline_id em leads. **Já criam/movem deal?** O inbound cria deal; automação
  `change_stage` move só o lead — ponto a corrigir.
- `import-leads.service.ts`: escreve os 4 em leads (já cria deal em lote — Fase 1 do fix
  anterior). Na reforma vira só-contato (doc §7).
- `edit-lead-modal.tsx`: **dual-write** lead+deal (stage_id/deal_value). Parar de escrever
  no lead, manter só no deal.
- `leads.service.ts`: `createLead` (via createLeadWithDeal), `bulkArchive` (status),
  `updateLead` (aceita status/stage/deal_value no tipo).

### Escrita legado/dead code — risco BAIXO (remover)
- **`lead-card.tsx`**: componente **não renderizado** (kanban usa `DealCard`). Usa
  `useMoveLeadToStage`/`useUpdateDealValueAndMove` (escrevem leads). Candidato a deleção.
- **`useMoveLeadToStage`, `useUpdateDealValueAndMove`, `useMoveLeadToPipeline`** (use-leads):
  só consumidos pelo LeadCard morto. Remover junto.

### Leitura simples (fácil migrar p/ deals) — risco BAIXO
- `dashboard/follow-up-tips`, `next-actions-card` (stage do lead → stage do deal).
- `personal-reports.service.ts` (trocar leads.status='deal'→deals.status='won',
  deal_value→value).
- `export-leads.ts` (ler de deals ou do join).
- mapeamentos de leitura em pipeline-board/deals.tsx (já vêm do deal).

### Neutro
- SDR (não depende de stage/status).
- Triggers `log_lead_activity` (auditoria; segue funcionando, mas perde sentido se os campos
  saírem de leads — revisar na Fase de limpeza).

---

## 7. Ordem recomendada dentro da Fase 2 (migrar leitura, do isolado ao central)

1. **Dead code primeiro**: remover `LeadCard` + hooks `useMoveLeadToStage`/
   `useUpdateDealValueAndMove`/`useMoveLeadToPipeline`. Zero risco, reduz superfície.
2. **`personal-reports.service.ts`**: migrar para `deals` (status='won', value). Isolado,
   testável, é a única métrica ainda presa em leads.
3. **`export-leads.ts`**: ler negócio do deal. Isolado.
4. **Dashboard tips** (`follow-up-tips`, `next-actions-card`): trocar `leads.stage_id` por
   stage do deal. Baixo acoplamento.
5. **`edit-lead-modal.tsx`**: parar o dual-write — escrever stage/value só no deal.
   Médio (precisa garantir que o trigger de deal cobre status/closed_at).
6. **Edge writes** (`run-automations` `change_stage`, depois inbound/instagram): garantir
   que movem o **deal**, não o lead. Server-side, exige deploy coordenado.
7. **`get_conversation_list` + mapper do inbox** por último: é o contrato mais central.
   Idealmente o inbox passa a buscar negócio via `deals` (ou a RPC passa a juntar deals),
   com o frontend já preparado pelos passos anteriores.

> `leads.status` é o caso mais delicado: é escrito por **trigger** (não por código de app).
> Só remover o campo/trigger quando (2),(5),(6) estiverem migrados e o inbox (7) não
> depender mais de `leads.status`.
