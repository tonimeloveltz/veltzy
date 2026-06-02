# Spec - Refatoracao: Entidade Deal + Conflito de Territorio

> Baseado em: [PRD - Deal Refactor](./PRD.md)

---

## 1. Arquitetura

### 1.1. Nova Tabela: `veltzy.deals`

Migration: `supabase/migrations/054_create_deals_table.sql`

```sql
CREATE TABLE IF NOT EXISTS veltzy.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES veltzy.leads(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Negocio',
  value NUMERIC DEFAULT 0,
  stage_id UUID REFERENCES veltzy.pipeline_stages(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES veltzy.pipelines(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'won', 'lost', 'archived', 'pending_assignment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON veltzy.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON veltzy.deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON veltzy.deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON veltzy.deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_status ON veltzy.deals(status);

-- RLS
ALTER TABLE veltzy.deals ENABLE ROW LEVEL SECURITY;

-- Policies (idempotentes com DO $$ BEGIN / IF NOT EXISTS)
CREATE POLICY "vz_deals_select" ON veltzy.deals
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_deals_insert" ON veltzy.deals
  FOR INSERT TO authenticated
  WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_deals_update" ON veltzy.deals
  FOR UPDATE TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_deals_delete" ON veltzy.deals
  FOR DELETE TO authenticated
  USING (veltzy.is_company_admin() OR veltzy.is_super_admin());

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON veltzy.deals TO authenticated;
GRANT ALL ON veltzy.deals TO service_role;

-- Trigger updated_at (reutiliza handle_updated_at existente)
CREATE TRIGGER set_deals_updated_at
  BEFORE UPDATE ON veltzy.deals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

### 1.2. Migracao de Dados (idempotente)

Inclusa na mesma migration `054_create_deals_table.sql`. Para cada lead existente, cria um deal correspondente. A clausula `WHERE NOT EXISTS` garante idempotencia.

```sql
INSERT INTO veltzy.deals (
  company_id, lead_id, name, value, stage_id,
  pipeline_id, assigned_to, status, created_at
)
SELECT
  l.company_id,
  l.id,
  COALESCE(l.name, 'Negocio') AS name,
  COALESCE(l.deal_value, 0) AS value,
  l.stage_id,
  l.pipeline_id,
  l.assigned_to,
  CASE
    WHEN l.status = 'deal' THEN 'won'
    WHEN l.status = 'lost' THEN 'lost'
    WHEN l.status = 'archived' THEN 'archived'
    ELSE 'open'
  END AS status,
  l.created_at
FROM veltzy.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM veltzy.deals d WHERE d.lead_id = l.id
);
```

### 1.3. SQL Retroativo (re-run da migracao)

Caso a migration precise ser re-executada (ex: novos leads criados antes da UI migrar), basta rodar o INSERT acima novamente. O `WHERE NOT EXISTS` previne duplicatas. Exemplo de execucao manual:

```sql
-- Recriar deals para leads que ainda nao tem deal associado
INSERT INTO veltzy.deals (
  company_id, lead_id, name, value, stage_id,
  pipeline_id, assigned_to, status, created_at
)
SELECT
  l.company_id,
  l.id,
  COALESCE(l.name, 'Negocio') AS name,
  COALESCE(l.deal_value, 0) AS value,
  l.stage_id,
  l.pipeline_id,
  l.assigned_to,
  CASE
    WHEN l.status = 'deal' THEN 'won'
    WHEN l.status = 'lost' THEN 'lost'
    WHEN l.status = 'archived' THEN 'archived'
    ELSE 'open'
  END AS status,
  l.created_at
FROM veltzy.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM veltzy.deals d WHERE d.lead_id = l.id
);

-- Verificar resultado
SELECT
  (SELECT count(*) FROM veltzy.leads) AS total_leads,
  (SELECT count(*) FROM veltzy.deals) AS total_deals,
  (SELECT count(*) FROM veltzy.leads l WHERE NOT EXISTS (
    SELECT 1 FROM veltzy.deals d WHERE d.lead_id = l.id
  )) AS leads_sem_deal;
```

---

## 2. Tipos TypeScript

### 2.1. `src/types/database.ts`

```typescript
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
  created_at: string
  updated_at: string
  // joins opcionais
  lead?: Lead
  stage?: PipelineStage
  pipeline?: Pipeline
  assignee?: Partial<Profile> | null
}

export interface DealWithLead extends Deal {
  leads?: Pick<Lead, 'id' | 'name' | 'phone' | 'email' | 'avatar_url' | 'temperature' | 'tags' | 'is_ai_active' | 'transfer_summary' | 'source_id' | 'created_at'> & {
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
}

export interface UpdateDealInput {
  name?: string
  value?: number
  stage_id?: string | null
  pipeline_id?: string | null
  assigned_to?: string | null
  status?: DealStatus
}
```

Alem disso, `NotificationType` foi estendido com `'territory_conflict'`:

```typescript
export type NotificationType = 'new_lead' | 'lead_assigned' | 'new_message' | 'lead_transferred' | 'system' | 'copilot' | 'territory_conflict'
```

---

## 3. Camada de Servicos

### 3.1. `src/services/deals.service.ts`

| Metodo | Descricao |
|---|---|
| `getDealsByCompany(companyId, filters?)` | Lista deals com filtros (pipeline, stage, status, assigned_to, search). Paginacao via limit/offset |
| `getDealsByLead(companyId, leadId)` | Todos os deals de um contato (para painel lateral no chat) |
| `getDealsForKanban(companyId, pipelineId)` | Deals com status `open` ou `pending_assignment` de um pipeline. Select com joins (leads, stages, pipelines) |
| `createDeal(companyId, input)` | Insert com select do deal completo (joins) |
| `updateDeal(companyId, dealId, input)` | Update parcial com select |
| `moveDealStage(companyId, dealId, stageId, pipelineId?)` | Move deal para outro stage (e opcionalmente outro pipeline) |
| `updateDealValueAndMove(companyId, dealId, stageId, value)` | Atualiza valor e move stage em uma operacao (para modal de deal value obrigatorio) |
| `assignDeal(companyId, dealId, userId)` | Atribui vendedor ao deal, muda status de `pending_assignment` para `open` |
| `bulkUpdateAssignedTo(companyId, dealIds, targetUserId)` | Atribuicao em lote (batches de 50) |
| `bulkArchive(companyId, dealIds)` | Arquivamento em lote |
| `bulkDelete(companyId, dealIds, userId)` | Exclusao em lote com log em activity_logs |
| `bulkMoveToPipeline(companyId, dealIds, targetPipelineId)` | Move deals para outro pipeline (primeiro stage do destino) |

Select padrao com joins (constante `DEAL_WITH_LEAD_SELECT`):

```typescript
const DEAL_WITH_LEAD_SELECT = `
  *,
  leads:lead_id(id, name, phone, email, avatar_url, temperature, tags, is_ai_active, transfer_summary, source_id, created_at,
    lead_sources:source_id(*)
  ),
  pipeline_stages:stage_id(*),
  pipelines:pipeline_id(*)
`
```

---

## 4. Hooks

### 4.1. `src/hooks/use-deals.ts`

| Hook | Query Key | Descricao |
|---|---|---|
| `useDealsForKanban(pipelineId?)` | `['deals', 'kanban', companyId, pipelineId, ...]` | Deals ativos do pipeline para o kanban. Filtra por seller se role = seller. Enriches com profiles via useTeamMembers |
| `useDashboardDeals(pipelineId?, showArchived?)` | `['deals', 'dashboard', companyId, pipelineId, ...]` | Deals para pagina de Negocios e dashboard. Suporta filtro por pipeline |
| `useDealsByLead(leadId?)` | `['deals', 'lead', companyId, leadId]` | Deals de um contato especifico (painel lateral no chat) |
| `useCreateDeal()` | mutation | Cria deal. Invalida `['deals']`. Toast de sucesso |
| `useUpdateDeal()` | mutation | Atualiza deal. Invalida `['deals']` |
| `useMoveDealStage()` | mutation | Move stage com optimistic update no kanban. Rollback on error |
| `useUpdateDealValueAndMove()` | mutation | Atualiza valor + move com optimistic update |
| `useAssignDeal()` | mutation | Atribui vendedor. Invalida `['deals']` e `['notifications']`. Toast de sucesso |

Todos os hooks de query usam `staleTime: 30 * 1000` e `enabled` condicional.

---

## 5. Mudancas na UI

### 5.1. Kanban (`src/components/pipeline/pipeline-board.tsx`)

**Antes:** Kanban lia de `useLeads` e renderizava `LeadCard`.
**Depois:** Kanban le de `useDealsForKanban` e renderiza `DealCard`.

Mudancas principais:
- Dados vem de `useDealsForKanban(activePipelineId)` em vez de `useLeads`
- Cards sao `DealCard` em vez de `LeadCard`
- Coluna especial "Sem dono" para deals com `status = 'pending_assignment'`
- Deals `pending_assignment` ficam separados dos deals ativos
- Drag & drop opera sobre `deal.id`
- Celebration de deal ganho continua funcionando (stage `is_final + is_positive`)

### 5.2. DealCard (`src/components/pipeline/deal-card.tsx`)

Substitui `LeadCard` no kanban. Exibe:
- Nome do contato (via `deal.leads.name`)
- Nome do negocio (`deal.name`)
- Valor (`deal.value`)
- Temperatura (via `deal.leads.temperature`)
- Tags do contato
- Vendedor atribuido
- Badge "Sem dono" se `status = 'pending_assignment'`
- Transfer summary (se existir)

Menu dropdown inclui:
- Editar negocio
- Mover para pipeline
- Atribuir vendedor
- Arquivar

### 5.3. Pagina de Negocios (`src/pages/deals.tsx`)

**Antes:** Listava leads.
**Depois:** Lista deals via `useDashboardDeals`.

Colunas da tabela:
- Contato (nome + telefone do lead)
- Empresa (`company_name` do lead)
- Negocio (nome do deal)
- Valor
- Stage
- Pipeline
- Vendedor
- Data de criacao

KPIs no topo agregam por deal (total, valor total, won, lost, etc).

### 5.4. Chat/Inbox

Chat continua vinculado ao contato (`lead_id`), sem mudanca estrutural.

Adicoes:
- Painel lateral exibe deals ativos do contato via `useDealsByLead(leadId)`
- Cada deal mostra: nome, valor, stage, pipeline, status
- Botao "Novo negocio" no painel lateral abre modal de criacao de deal

---

## 6. Conflito de Territorio

### 6.1. Logica no Inbound Handler (`supabase/functions/_shared/lead-inbound-handler.ts`)

Quando mensagem WhatsApp chega e o contato ja existe na base, o handler precisa detectar conflito de territorio antes de criar um deal:

```
1. Buscar lead existente por phone + company_id
2. Se lead NAO existe:
   - Criar lead + deal (fluxo atual, sem conflito)
3. Se lead JA existe:
   a. Buscar pipeline da campanha/instancia de entrada
   b. Comparar com pipeline do deal ativo do contato
   c. SE mesmo pipeline OU mesmo vendedor:
      - Criar deal com status = 'open'
      - assigned_to = lead.assigned_to (mesmo vendedor)
   d. SE pipeline diferente E vendedor diferente:
      - Criar deal com status = 'pending_assignment'
      - assigned_to = NULL
      - Disparar notificacao territory_conflict
```

### 6.2. Notificacao (`territory_conflict`)

Inserida na tabela `veltzy.notifications` com:

```typescript
{
  company_id: companyId,
  user_id: null,  // visivel para admins/managers
  type: 'territory_conflict',
  title: `${leadName} ja atendido por ${vendedorNome}`,
  body: `Nova entrada em ${pipelineNome}. Clique para atribuir.`,
  metadata: {
    deal_id: newDealId,
    lead_id: leadId,
    current_owner_id: currentOwnerId,
    current_owner_name: currentOwnerName,
    target_pipeline_id: targetPipelineId,
    target_pipeline_name: targetPipelineName,
  },
  read: false,
}
```

### 6.3. Central de Notificacoes (UI)

Na central de notificacoes existente, o tipo `territory_conflict` renderiza:
- Icone de alerta (AlertTriangle)
- Texto: "[Contato] ja atendido por [Vendedor A]. Nova entrada em [Pipeline X]."
- Botao "Atribuir" que abre modal de atribuicao inline
- Modal lista vendedores da empresa (useTeamMembers)
- Ao confirmar, chama `useAssignDeal` que:
  - Seta `assigned_to` no deal
  - Muda `status` de `pending_assignment` para `open`
  - Marca notificacao como lida
  - Invalida queries de deals e notificacoes

---

## 7. Lista de Arquivos

### Novos arquivos

| Arquivo | Descricao |
|---|---|
| `supabase/migrations/054_create_deals_table.sql` | Migration: tabela deals + indexes + RLS + grants + trigger + migracao de dados |
| `src/services/deals.service.ts` | CRUD de deals, queries para kanban/dashboard/lead, operacoes em lote |
| `src/hooks/use-deals.ts` | Hooks React Query para deals (kanban, dashboard, CRUD, mutations) |
| `src/components/pipeline/deal-card.tsx` | Card de deal no kanban (substitui LeadCard) |

### Arquivos modificados

| Arquivo | Mudanca |
|---|---|
| `src/types/database.ts` | + `DealStatus`, `Deal`, `DealWithLead`, `CreateDealInput`, `UpdateDealInput`. + `territory_conflict` em `NotificationType` |
| `src/components/pipeline/pipeline-board.tsx` | Usa `useDealsForKanban` em vez de `useLeads`. Renderiza `DealCard`. Coluna "Sem dono" para `pending_assignment` |
| `src/pages/deals.tsx` | Lista deals via `useDashboardDeals` em vez de leads. Colunas e KPIs por deal |
| `src/components/inbox/chat-sidebar.tsx` | Painel lateral exibe deals ativos do contato via `useDealsByLead` |
| `supabase/functions/_shared/lead-inbound-handler.ts` | Logica de conflito de territorio ao criar deal para lead existente |
| `src/components/notifications/notification-item.tsx` | Renderiza tipo `territory_conflict` com botao de atribuicao |

---

## 8. Criterios de Aceite

### Entidade Deal
- [ ] Tabela `veltzy.deals` criada com todas as colunas, indexes e RLS
- [ ] Migration idempotente (pode rodar mais de uma vez sem duplicar)
- [ ] Todos os leads existentes geram um deal na migracao
- [ ] Status mapeados corretamente: `deal` -> `won`, `lost` -> `lost`, `archived` -> `archived`, demais -> `open`

### Kanban
- [ ] Card no kanban representa um deal, nao um lead
- [ ] Card exibe nome do contato + nome do negocio + valor + temperatura
- [ ] Um contato pode ter multiplos cards no kanban
- [ ] Drag & drop move o deal entre stages normalmente
- [ ] Coluna "Sem dono" aparece quando ha deals `pending_assignment`
- [ ] Celebration ao fechar negocio (stage final positivo) continua funcionando

### Pagina de Negocios
- [ ] Tabela lista deals, nao leads
- [ ] Colunas: Contato, Empresa, Negocio, Valor, Stage, Pipeline, Vendedor, Data
- [ ] Filtros por periodo, pipeline e vendedor funcionam
- [ ] KPIs agregam por deal

### Conflito de Territorio
- [ ] Lead existente + mesmo pipeline/vendedor: deal criado com `open`
- [ ] Lead existente + pipeline diferente + vendedor diferente: deal criado com `pending_assignment`
- [ ] Notificacao `territory_conflict` disparada para admins/managers
- [ ] Central de notificacoes exibe notificacao com botao "Atribuir"
- [ ] Modal de atribuicao permite escolher vendedor
- [ ] Ao atribuir, deal muda de `pending_assignment` para `open`
- [ ] Deal some da coluna "Sem dono" e aparece na coluna do stage correto

### Chat/Inbox
- [ ] Chat continua vinculado ao contato (sem mudanca)
- [ ] Painel lateral exibe deals ativos do contato
- [ ] Botao "Novo negocio" cria deal para o contato

### Retrocompatibilidade
- [ ] RLS por `company_id` funciona corretamente
- [ ] Seller ve apenas deals atribuidos a ele no kanban
- [ ] Super admin bypass funciona
- [ ] Queries de kanban nao degradam com a nova tabela

### Performance
- [ ] Indexes em `company_id`, `lead_id`, `stage_id`, `assigned_to`, `status`
- [ ] Select com joins (leads, stages, pipelines) retorna em tempo aceitavel

---

## 9. Fora do Escopo

- Renomear "lead" para "contato" na UI (Fase 3)
- Entidade Company separada (futuro)
- Vincular mensagens a deals especificos (futuro)
- Permissoes por pipeline/deal (futuro)
- Comparacao entre deals do mesmo contato (futuro)
