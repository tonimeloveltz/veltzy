# F3 — Controle de Acesso a Pipelines por Vendedor

**Status:** Design (aguardando decisoes de produto)
**Data:** 2026-06-10

---

## 1. Estado Atual

### Como pipelines sao listados hoje

| Local | Componente | Query | Filtro de acesso |
|-------|-----------|-------|-----------------|
| Kanban (topo) | `PipelineSelector` | `usePipelines()` → `getPipelines(companyId)` | **Nenhum** — todos veem todos |
| Dashboard | `PipelineFilter` | `usePipelines()` | **Nenhum** |
| Pagina Negocios | `PipelineFilter` | `usePipelines()` | **Nenhum** |
| Admin > Pipeline | `PipelineListManager` | `usePipelines()` | Pagina restrita a admin |
| Mover deal | `MovePipelineModal` | `usePipelines()` | **Nenhum** |
| Bulk move | `BulkMovePipelineModal` | `usePipelines()` | **Nenhum** |

**Query atual** (`pipelines.service.ts`):
```sql
SELECT * FROM veltzy.pipelines
WHERE company_id = ? AND is_active = true
ORDER BY position
```

**RLS atual** (`027_multiplos_pipelines.sql`):
```sql
-- Qualquer membro da empresa ve todos os pipelines
CREATE POLICY "vz_pip_select" ON veltzy.pipelines FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
```

### Controle existente por role

- **Pipelines**: zero filtro por role — todo mundo ve tudo
- **Deals/Leads**: seller ve apenas deals atribuidos a ele (filtro frontend em `useDealsForKanban` + RLS em leads com `assigned_to`)
- **Stages**: todos veem, apenas admin cria/edita/deleta
- **Admin page**: restrita a admin (`ProtectedRoute requireRole={['admin']}`)
- **Gestao page**: restrita a manager+ (`requireRole={['manager', 'admin']}`)

### Fluxo do seletor de pipeline

1. `PipelineBoard` monta → chama `usePipelines()`
2. Hook chama `getPipelines(companyId)` → Supabase query sem filtro de role
3. `PipelineSelector` renderiza tabs horizontais (so aparece se >1 pipeline)
4. Usuario clica → `activePipelineId` atualizado no Zustand (`usePipelineStore`)
5. `useDealsForKanban(activePipelineId)` busca deals daquele pipeline

---

## 2. Modelo de Dados Proposto

### Nova tabela: `veltzy.user_pipeline_access`

```sql
CREATE TABLE veltzy.user_pipeline_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES veltzy.pipelines(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, pipeline_id)
);

CREATE INDEX idx_upa_profile ON veltzy.user_pipeline_access(profile_id);
CREATE INDEX idx_upa_pipeline ON veltzy.user_pipeline_access(pipeline_id);
CREATE INDEX idx_upa_company ON veltzy.user_pipeline_access(company_id);
```

### Semantica: Allowlist

**Modelo escolhido: linha presente = tem acesso.**

Justificativa:
- Allowlist e mais seguro: se esquecer de inserir, o vendedor **nao** ve (fail-closed)
- Denylist e perigoso: se esquecer de inserir, o vendedor **ve** (fail-open)
- Mais simples de consultar: `EXISTS (SELECT 1 FROM user_pipeline_access WHERE ...)`
- Padrao da industria para controle de acesso granular

### Regras de negocio no modelo

| Role | Regra | Consulta user_pipeline_access? |
|------|-------|-------------------------------|
| `super_admin` | Ve tudo, sempre | Nao — bypass total |
| `admin` | Ve tudo na empresa | Nao — bypass |
| `manager` | Ve tudo na empresa | Nao — bypass |
| `seller` | Ve apenas pipelines com linha em `user_pipeline_access` | **Sim** |
| `representative` | Ve apenas pipelines com linha em `user_pipeline_access` | **Sim** (decisao pendente — ver pergunta 5) |

### RLS da nova tabela

```sql
ALTER TABLE veltzy.user_pipeline_access ENABLE ROW LEVEL SECURITY;

-- Admins/managers veem e gerenciam acessos da empresa
CREATE POLICY "upa_select" ON veltzy.user_pipeline_access FOR SELECT TO authenticated
  USING (
    company_id = veltzy.get_current_company_id()
    AND (veltzy.is_admin_or_manager() OR profile_id = veltzy.get_current_profile_id())
    OR veltzy.is_super_admin()
  );

CREATE POLICY "upa_manage" ON veltzy.user_pipeline_access FOR ALL TO authenticated
  USING (
    company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin()
    OR veltzy.is_super_admin()
  );
```

---

## 3. Pontos de Aplicacao do Filtro

### Opcao A: Filtro RLS (recomendado)

Alterar a policy de SELECT em `veltzy.pipelines` para respeitar `user_pipeline_access`:

```sql
-- Substitui vz_pip_select
DROP POLICY "vz_pip_select" ON veltzy.pipelines;

CREATE POLICY "vz_pip_select" ON veltzy.pipelines FOR SELECT TO authenticated
  USING (
    veltzy.is_super_admin()
    OR (
      company_id = veltzy.get_current_company_id()
      AND (
        veltzy.is_admin_or_manager()
        OR EXISTS (
          SELECT 1 FROM veltzy.user_pipeline_access upa
          WHERE upa.pipeline_id = pipelines.id
            AND upa.profile_id = veltzy.get_current_profile_id()
        )
      )
    )
  );
```

**Vantagens RLS:**
- Seguranca real — vendedor nao burla via API/Supabase client direto
- Filtro automatico em TODAS as queries (pipelines, deals via JOIN, dashboard)
- Unica fonte de verdade
- Nao precisa alterar cada hook/service individualmente

**Desvantagens RLS:**
- Mais complexo para debugar
- Performance: subquery em toda SELECT de pipeline (mitigado pelo index)
- Precisa popular `user_pipeline_access` para todos sellers existentes na migracao

### Opcao B: Filtro app-level (nao recomendado)

Alterar `getPipelines()` e cada hook para filtrar no frontend/service.

**Problemas:**
- Vendedor pode acessar pipelines via Supabase client direto (inseguro)
- Precisa alterar ~15 pontos de codigo (cada hook que usa pipeline)
- Facil esquecer um ponto e vazar acesso

### Recomendacao: **Opcao A (RLS)** + filtro complementar no frontend para UX

---

### 3.1 Inventario completo de pontos que precisam respeitar o filtro

Se usar RLS, a maioria ja funciona automaticamente. Pontos que precisam atencao:

| # | Local | Arquivo | Impacto com RLS | Acao necessaria |
|---|-------|---------|----------------|-----------------|
| 1 | Seletor de pipeline (kanban) | `pipeline-selector.tsx` | **Automatico** — `usePipelines()` ja retorna so os acessiveis | Nenhuma |
| 2 | PipelineFilter (dashboard/deals) | `pipeline-filter.tsx` | **Automatico** | Nenhuma |
| 3 | Kanban deals | `pipeline-board.tsx` | **Automatico** — pipeline filtrado, deals seguem | Nenhuma |
| 4 | Dashboard KPIs | `dashboard.tsx` | **Parcial** — se "Todos os pipelines" agregar, precisa filtrar no service | Ajustar queries de dashboard que fazem `pipeline_id IS NULL` (todos) |
| 5 | Pagina Negocios | `deals.tsx` | **Parcial** — coluna pipeline mostra nome; filtro funciona | Ajustar query de deals "todos" para JOIN com pipelines (RLS filtra) |
| 6 | Mover deal entre pipelines | `move-pipeline-modal.tsx` | **Automatico** — lista de destino ja filtrada | Nenhuma |
| 7 | Bulk move | `bulk-move-pipeline-modal.tsx` | **Automatico** | Nenhuma |
| 8 | Admin > Pipeline | `pipeline-list-manager.tsx` | **Automatico** — admin bypassa RLS | Nenhuma |
| 9 | Pipeline overview (dashboard) | `pipeline-overview-card.tsx` | **Automatico** | Nenhuma |
| 10 | Forecast/Bottleneck | `forecast-card.tsx`, `bottleneck-detector.tsx` | **Automatico** | Nenhuma |
| 11 | Seller performance table | `seller-performance-table.tsx` | Precisa verificar se query agrega por pipeline | Validar |
| 12 | Criar lead/deal | `create-lead-modal.tsx` | **Automatico** — so ve pipelines acessiveis | Nenhuma |

### Deals de pipelines sem acesso

Alem de filtrar pipelines, precisamos decidir o que fazer com **deals** em pipelines que o seller perdeu acesso:

**Opcao recomendada**: Alterar RLS de deals para respeitar `user_pipeline_access`:

```sql
-- Adicionar condicao ao vz_deals_select
-- Seller so ve deals de pipelines que tem acesso
DROP POLICY "vz_deals_select" ON veltzy.deals;

CREATE POLICY "vz_deals_select" ON veltzy.deals FOR SELECT TO authenticated
  USING (
    veltzy.is_super_admin()
    OR (
      company_id = veltzy.get_current_company_id()
      AND (
        veltzy.is_admin_or_manager()
        OR (
          assigned_to = veltzy.get_current_profile_id()
          AND EXISTS (
            SELECT 1 FROM veltzy.user_pipeline_access upa
            WHERE upa.pipeline_id = deals.pipeline_id
              AND upa.profile_id = veltzy.get_current_profile_id()
          )
        )
      )
    )
  );
```

Isso significa: seller so ve deals que sao seus **E** estao em pipelines que ele tem acesso.

---

## 4. UI de Controle (Onde o Admin Configura)

### Localizacao recomendada

**Gestao > Vendedores** (tab existente em `sellers-tab.tsx`)

Justificativa:
- O admin ja gerencia vendedores nesta tela
- Fluxo natural: ver vendedor → configurar acesso
- Nao faz sentido criar pagina nova so pra isso

### Formato recomendado: Por vendedor, lista de pipelines com toggle

**Por que por-vendedor (e nao por-pipeline):**
- O admin pensa "quero configurar o Joao" → abre card do Joao → ve os pipelines
- Mais intuitivo quando a acao e "gerenciar o que o vendedor ve"
- Menos cliques: 1 lugar pra configurar tudo do vendedor
- Por-pipeline seria util se tivesse 50 pipelines e poucos vendedores (improvavel)

### Proposta de UI

#### No `SellerCard` existente: novo botao "Pipelines"

```
+------------------------------------------+
| [Avatar] Joao Silva                      |
| joao@empresa.com                         |
| [Vendedor]  [Verde: Disponivel]          |
|                                          |
| [Alterar Cargo v]  [Pipelines]  [Remover]|
+------------------------------------------+
```

Ao clicar "Pipelines", abre um **drawer/modal** lateral:

```
+------------------------------------------+
| Acesso a Pipelines - Joao Silva          |
|                                          |
| Selecione os pipelines que este          |
| vendedor pode visualizar:                |
|                                          |
| [x] Pipeline Principal                   |
| [x] Cafe                                 |
| [ ] Marketplace                          |
| [x] Pos-venda                            |
|                                          |
| Nota: Negocios em pipelines sem acesso   |
| continuam atribuidos ao vendedor, mas    |
| nao aparecem na visao dele.              |
|                                          |
|              [Cancelar]  [Salvar]         |
+------------------------------------------+
```

#### Componentes novos necessarios

| Componente | Descricao |
|-----------|-----------|
| `PipelineAccessModal` | Modal com lista de pipelines + checkboxes |
| `usePipelineAccess(profileId)` | Hook para GET acessos do vendedor |
| `useUpdatePipelineAccess()` | Hook para PUT (sync completo: add/remove linhas) |

#### Indicador visual no SellerCard

Quando o vendedor tem acesso restrito (nao tem todos os pipelines), mostrar badge:

```
[Vendedor] [3/5 pipelines]
```

### Admin > Pipeline (visao complementar)

Na tela de admin de pipelines (`pipeline-list-manager.tsx`), ao lado de cada pipeline, mostrar quantos vendedores tem acesso:

```
Pipeline Principal  [5 vendedores]  [Editar] [...]
Cafe               [3 vendedores]  [Editar] [...]
```

Sem UI de edicao aqui — so informativo. A edicao fica em Gestao > Vendedores.

---

## 5. Interacao com Funcionalidades Existentes

### 5.1 Duplicacao / Territory Conflict

**Situacao**: Lead chega e duplicacao detecta que ja existe em pipeline X, mas o seller atribuido nao tem acesso ao pipeline X.

**Impacto**: Baixo. O fluxo de duplicacao e resolvido por admin/manager (que tem acesso total). O seller nem ve o conflito — ele so ve o lead no pipeline que tem acesso.

**Acao necessaria**: Nenhuma.

### 5.2 Atribuicao automatica de deals (auto-distribution)

**Situacao**: Lead novo chega via WhatsApp → sistema atribui a um seller via round-robin → deal criado no pipeline default.

**Risco**: Se o seller nao tiver acesso ao pipeline default, ele recebe o deal mas nao consegue ve-lo.

**Solucao**: Na logica de auto-distribuicao, filtrar sellers elegiveis para incluir apenas os que tem acesso ao pipeline de destino. Arquivo: verificar `useCreateLead` e a Edge Function de ingest.

### 5.3 Transferencia de lead (SDR → Seller)

**Situacao**: SDR transfere lead para seller que nao tem acesso ao pipeline onde o lead esta.

**Solucao**: No `TransferLeadModal`, filtrar a lista de sellers de destino para mostrar apenas os que tem acesso ao pipeline atual do lead.

### 5.4 Mover deal entre pipelines

**Situacao**: Admin move deal do seller para um pipeline ao qual o seller nao tem acesso.

**Comportamento esperado**: O deal continua atribuido ao seller, mas some da visao dele. O admin ve um warning antes de confirmar.

### 5.5 Deals ja atribuidos quando acesso e removido

**Pergunta de produto #4.** Opcoes:

| Opcao | Comportamento | Prós | Contras |
|-------|--------------|------|---------|
| A) Some da visao | Deal continua `assigned_to = seller` mas seller nao ve. Admin/manager ve normalmente | Simples, nao muda dados | Seller "perde" deals sem saber |
| B) Reatribui automaticamente | Deal vai pra fila `pending_assignment` | Garante que alguem atenda | Pode causar confusao se acesso foi removido por engano |
| C) Alerta ao admin | Ao remover acesso, mostra "Este vendedor tem 3 deals neste pipeline. Deseja reatribuir?" | Decisao consciente | Mais complexo de implementar |

**Recomendacao**: Opcao **C** (alerta ao admin) com fallback para **A** (some da visao se admin escolher manter).

---

## 6. Perguntas de Produto (Para Toni Decidir)

### Pergunta 1: Default para seller novo

> Seller novo ve TODOS os pipelines ate ser restringido, ou ve NENHUM ate ser liberado?

| Opcao | Pros | Contras |
|-------|------|---------|
| **Todos (permissivo)** | Nao quebra fluxo atual; admin so restringe quando precisa | Menos seguro; seller ve tudo ate admin lembrar de configurar |
| **Nenhum (restritivo)** | Mais seguro; admin configura conscientemente | Pode bloquear seller novo que nao consegue trabalhar ate admin liberar |
| **Todos + flag global** | Empresa escolhe o default nas configuracoes | Mais flexivel, mas mais complexo |

**Recomendacao**: **Todos (permissivo)** com flag visual na tela de equipe indicando "acesso total — nao configurado". Isso e implementado como: se o seller nao tem NENHUMA linha em `user_pipeline_access`, ele ve tudo (backwards-compatible). Se tem pelo menos 1 linha, ve so os listados.

Isso evita migracao de dados (nao precisa popular a tabela pra sellers existentes) e nao quebra nada.

### Pergunta 2: Filtro RLS vs app-level

> RLS (seguro, vendedor nao burla) vs app-level (mais simples)?

**Recomendacao forte: RLS.**

- Veltzy ja usa Supabase client direto no frontend — seller com conhecimento tecnico poderia burlar filtro app-level
- O padrao do projeto ja e RLS em tudo (leads, deals, messages)
- Custo adicional de RLS e baixo (1 subquery com index)
- App-level exigiria alterar ~15 pontos de codigo e e fragil

### Pergunta 3: UI por-vendedor ou por-pipeline

> Configurar acesso na visao do vendedor ou na visao do pipeline?

**Recomendacao: Por-vendedor** (ver secao 4 acima).

O fluxo mental do admin e "quero configurar o Joao", nao "quero configurar o pipeline Cafe". Por-vendedor encaixa na tela de Equipe existente, sem criar pagina nova.

### Pergunta 4: Deal atribuido em pipeline sem acesso

> O que acontece quando seller perde acesso a um pipeline onde tem deals?

**Recomendacao: Opcao C** — ao remover acesso, alertar admin mostrando quantos deals o seller tem naquele pipeline, com opcao de reatribuir ou manter (some da visao do seller).

### Pergunta 5: Representative entra na restricao?

> Representative segue a mesma regra de restricao que seller?

**Recomendacao: Sim.** Representative e um role com permissoes iguais ou menores que seller. Nao faz sentido um representative ter acesso irrestrito se o seller nao tem.

Na implementacao, a condicao e: `NOT is_admin_or_manager()` → checa `user_pipeline_access`.

---

## 7. Estimativa de Esforco

### Backend (banco + RLS)

| Item | Esforco | Detalhes |
|------|---------|---------|
| Migration: tabela `user_pipeline_access` | 1h | Schema + indexes + RLS policies |
| Migration: alterar RLS de `pipelines` | 1h | DROP + CREATE policy com subquery |
| Migration: alterar RLS de `deals` | 1h | Condicao adicional para sellers |
| Funcao helper `has_pipeline_access(pipeline_id)` | 30min | Otimizar chamadas RLS |
| Seed/migracao de dados existentes | 30min | Se default = permissivo, nao precisa popular |
| **Subtotal backend** | **~4h** | |

### Frontend — Servicos e hooks

| Item | Esforco | Detalhes |
|------|---------|---------|
| `pipeline-access.service.ts` | 1h | CRUD na tabela `user_pipeline_access` |
| `use-pipeline-access.ts` hook | 1h | GET/PUT acessos por vendedor |
| Ajustar `usePipelines` (cache key por role) | 30min | Invalidar quando acesso muda |
| **Subtotal services** | **~2.5h** | |

### Frontend — UI

| Item | Esforco | Detalhes |
|------|---------|---------|
| `PipelineAccessModal` | 2h | Lista pipelines + checkboxes + save |
| Botao "Pipelines" no `SellerCard` | 30min | Integrar com modal |
| Badge "X/Y pipelines" no `SellerCard` | 30min | Indicador visual |
| Info "N vendedores" no `PipelineListManager` | 1h | Contador por pipeline (admin) |
| Alerta ao remover acesso (deals existentes) | 1.5h | Query + dialog de confirmacao |
| Ajuste dashboard "todos os pipelines" | 1h | Garantir que agrega so acessiveis |
| Testes manuais em todos os pontos | 2h | Kanban, dashboard, deals, mover, criar |
| **Subtotal UI** | **~8.5h** | |

### Total estimado: **~15h** (2 dias de trabalho)

### Riscos

| Risco | Mitigacao |
|-------|----------|
| Performance RLS com subquery | Index em `profile_id` + `pipeline_id`; funcao `STABLE` |
| Auto-distribuicao ignora restricao | Testar e ajustar Edge Function de ingest |
| Seller fica "travado" sem pipelines | Default permissivo (sem linhas = ve tudo) |
| Metricas de dashboard inconsistentes | Query de "todos os pipelines" deve fazer JOIN com pipelines (RLS filtra) |

---

## 8. Arquivos Impactados (Referencia)

### Novos
- `supabase/migrations/XXX_user_pipeline_access.sql`
- `src/services/pipeline-access.service.ts`
- `src/hooks/use-pipeline-access.ts`
- `src/components/sellers/pipeline-access-modal.tsx`

### Modificados
- `src/components/sellers/seller-card.tsx` — botao + badge
- `src/components/admin/pipeline-list-manager.tsx` — contador vendedores
- `src/components/admin/sellers-tab.tsx` — integrar modal
- `src/services/dashboard.service.ts` — queries "todos os pipelines" com JOIN
- `src/types/database.ts` — tipo `UserPipelineAccess`
- Edge Function de auto-distribuicao (se existir) — filtrar sellers elegiveis

### Nao modificados (RLS cuida automaticamente)
- `src/hooks/use-pipelines.ts` — query ja passa pelo RLS
- `src/components/pipeline/pipeline-selector.tsx`
- `src/components/shared/pipeline-filter.tsx`
- `src/components/pipeline/move-pipeline-modal.tsx`
- Todos os hooks de dashboard que recebem `pipelineId`
