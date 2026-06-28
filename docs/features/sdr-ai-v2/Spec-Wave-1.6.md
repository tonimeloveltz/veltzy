# Spec - SDR AI v2 - Onda 1.6: Unificacao de Feature Flags + Cleanup Dashboard

> Feature: `sdr-ai-v2` / Onda 1.6
> Status: Em revisao
> Data: 2026-06-01

---

## 1. Objetivo

Unificar o sistema de feature flags migrando 8 flags boolean de `companies.features` (JSONB) para `tenant_feature_flags` (tabela dedicada com audit trail). Organizar a UI do Hub por categorias. Remover KPIs de infraestrutura do dashboard SDR IA no Veltzy.

## 2. Estado atual

### companies.features (JSONB em public.companies)

6 empresas no banco. Apenas "Martins e Fernandes" tem flags ligadas (whatsapp_enabled, custom_pipeline, representative_enabled). Todas as demais tem tudo false/default.

### tenant_feature_flags (Onda 1.5)

Tabela com `(company_id, feature_key, enabled, updated_by, updated_at)`. Unico registro existente: `sdr_agent_v2` para Veltz Group (enabled=true).

### O que NAO migra (decisao documentada)

| Flag | Motivo |
|---|---|
| `ai_sdr_enabled` | Consumida por `sdr-ai/index.ts:248` (backend v1). Resolver quando v1 for removido |
| `max_users` | Numerico (nao boolean). Aguarda sistema de quotas dedicado |
| `max_leads` | Idem |

---

## 3. Parte A -- Hub: Schema

### 3.1 Migration 1: adicionar coluna category

```sql
-- 20260601000001_tff_add_category.sql

ALTER TABLE public.tenant_feature_flags
  ADD COLUMN category text NOT NULL DEFAULT 'Outros';

-- Backfill registro existente
UPDATE public.tenant_feature_flags
  SET category = 'IA'
  WHERE feature_key = 'sdr_agent_v2';
```

### 3.2 Migration 2: backfill das 8 flags de companies.features

```sql
-- 20260601000002_tff_backfill_from_companies_features.sql

-- Para cada empresa, insere 8 flags lendo o valor atual de companies.features.
-- Se o campo nao existe no JSON, assume false (COALESCE).
-- ON CONFLICT ignora se ja existe (idempotente).

INSERT INTO public.tenant_feature_flags (company_id, feature_key, enabled, category)
SELECT
  c.id,
  flag.key,
  COALESCE((c.features ->> flag.key)::boolean, false),
  flag.category
FROM public.companies c
CROSS JOIN (VALUES
  ('whatsapp_enabled',           'Comunicacao'),
  ('instagram_enabled',          'Comunicacao'),
  ('campaign_whatsapp_enabled',  'Comunicacao'),
  ('google_calendar_enabled',    'Integracoes'),
  ('representative_enabled',     'CRM'),
  ('custom_pipeline',            'CRM'),
  ('export_reports',             'CRM'),
  ('automation_rules',           'CRM')
) AS flag(key, category)
ON CONFLICT (company_id, feature_key) DO NOTHING;
```

### 3.3 Rollback SQL (manter a mao, nao aplica automaticamente)

```sql
-- ROLLBACK: reverter backfill se necessario
DELETE FROM public.tenant_feature_flags
WHERE feature_key IN (
  'whatsapp_enabled', 'instagram_enabled', 'campaign_whatsapp_enabled',
  'google_calendar_enabled', 'representative_enabled', 'custom_pipeline',
  'export_reports', 'automation_rules'
);

-- ROLLBACK: reverter coluna category
ALTER TABLE public.tenant_feature_flags DROP COLUMN category;
```

---

## 4. Parte B -- Hub: UI

### 4.1 AVAILABLE_FEATURES atualizado

```ts
const AVAILABLE_FEATURES = [
  // IA
  { key: 'sdr_agent_v2', label: 'SDR IA', description: 'Agente de SDR conversacional com IA', category: 'IA' },

  // Comunicacao
  { key: 'whatsapp_enabled', label: 'WhatsApp', description: 'Envio e recebimento de mensagens via WhatsApp', category: 'Comunicacao' },
  { key: 'instagram_enabled', label: 'Instagram DM', description: 'Integracao com mensagens do Instagram', category: 'Comunicacao' },
  { key: 'campaign_whatsapp_enabled', label: 'Campanhas WhatsApp', description: 'Disparos em massa via WhatsApp (Leadbaze)', category: 'Comunicacao' },

  // Integracoes
  { key: 'google_calendar_enabled', label: 'Google Calendar', description: 'Sincronizacao de agenda e reunioes', category: 'Integracoes' },

  // CRM
  { key: 'representative_enabled', label: 'Representantes', description: 'Gestao de representantes comerciais', category: 'CRM' },
  { key: 'custom_pipeline', label: 'Pipeline personalizado', description: 'Etapas de pipeline customizaveis', category: 'CRM' },
  { key: 'export_reports', label: 'Exportar relatorios', description: 'Exportacao de dados em CSV/Excel', category: 'CRM' },
  { key: 'automation_rules', label: 'Regras de automacao', description: 'Automacao de tarefas e workflows', category: 'CRM' },
] as const

const CATEGORY_ORDER = ['IA', 'Comunicacao', 'Integracoes', 'CRM', 'Outros']
```

### 4.2 FeatureFlagsTab renderiza por categoria

Componente `feature-flags-tab.tsx`:
- Agrupa `AVAILABLE_FEATURES` por `category`
- Renderiza na ordem de `CATEGORY_ORDER`
- Cada categoria: heading (h3) + lista de toggles com separator entre itens
- Mantém comportamento existente: toggle chama `upsertFeatureFlag`, mostra timestamp do ultimo update

### 4.3 Aba "Features" antiga

Apos migracao, a aba "Features" (`features-tab.tsx`) so contem 3 itens uteis:
- `ai_sdr_enabled` (boolean, legacy v1)
- `max_users` (numerico)
- `max_leads` (numerico)

**Decisao:** Manter a aba "Features" renomeada para "Legacy" com nota explicativa: "Estas configuracoes serao migradas em versoes futuras." Exibe apenas os 3 itens remanescentes. Remove os 8 itens migrados da constante `FEATURE_CATEGORIES`.

### 4.4 company-card.tsx e company-detail.tsx

- `company-card.tsx`: badges de features. Atualizar para ler de `tenant_feature_flags` em vez de `companies.features` para as 8 flags migradas. Manter leitura de `companies.features` apenas para `ai_sdr_enabled`, `max_users`, `max_leads`.
- `company-detail.tsx`: `featureLabels` dict. Remover as 8 flags migradas (agora aparecem na aba Feature Flags). Manter `ai_sdr_enabled`.

---

## 5. Parte C -- Veltzy: Dashboard /sdr-ia

### 5.1 KPIs a remover

| KPI | Icone | Motivo |
|---|---|---|
| Custo total | DollarSign | Metrica de infra, pertence ao Hub |
| Custo medio/conversa | DollarSign | Idem |
| Tokens consumidos | Zap | Idem |
| Tool calls | Hash | Idem |

### 5.2 KPIs que permanecem

| KPI | Icone | Valor |
|---|---|---|
| Conversas iniciadas | MessageSquare | `metrics.conversations_started` |
| Conversas ativas | Clock | `metrics.conversations_active` |
| Taxa de qualificacao | Target | `metrics.qualification_rate * 100` |
| Escaladas p/ humano | ArrowUpRight | `metrics.escalation_count` |

### 5.3 Layout

Grid muda de `lg:grid-cols-4` (8 cards em 2 linhas) para `sm:grid-cols-2 lg:grid-cols-4` (4 cards em 1 linha no desktop, 2x2 no tablet).

### 5.4 Cleanup do service e types

**`src/types/sdr-v2.ts` -- interface SdrV2Metrics:**
- Remover campos: `total_cost_brl`, `avg_cost_per_conversation_brl`, `total_tokens`, `total_tool_calls`
- Manter: `conversations_started`, `conversations_active`, `qualification_rate`, `escalation_count`

**`src/services/sdr-v2-metrics.service.ts` -- funcao getSdrV2Metrics:**
- Remover query de `total_tool_calls` (linhas 76-86: query em sdr_tool_calls)
- Remover calculo de `total_cost_brl` e `avg_cost_per_conversation_brl` (linhas 109, 117-118)
- Remover calculo de `total_tokens` (linha 119)
- Simplificar query principal: nao precisa mais selecionar `total_tokens_used` e `total_cost_usd`
- Remover import `USD_TO_BRL` de `@/types/sdr-v2`

**`src/types/sdr-v2.ts` -- constante USD_TO_BRL:**
- Verificar se consumida por algo alem do service. Se nao, remover.

**`src/components/sdr-v2/dashboard/SdrV2Dashboard.tsx`:**
- Remover imports `DollarSign`, `Zap`, `Hash`
- Remover 4 KpiCards dos campos removidos
- Remover funcao `formatBRL` se nao usada em outro lugar (verificar: usada na tabela de conversas para `total_cost_usd * USD_TO_BRL`)

**Nota sobre tabela de conversas:** A coluna "Custo" na tabela de conversas recentes (`conv.total_cost_usd * USD_TO_BRL`) tambem e metrica de infra. Remover essa coluna da tabela. Manter: Lead, Pipeline, Status, Iteracoes, Ultima atividade. Remover: Tokens, Custo.

---

## 6. Parte D -- Dividas tecnicas

Adicionar ao `DEBT-Wave-1.md`:

### Item 10: ai_sdr_enabled em companies.features
- Backend v1 (`sdr-ai/index.ts:248`) consulta `companies.features.ai_sdr_enabled` direto
- Resolver quando v1 for removido (onda futura)
- Nao pode migrar sem atualizar a Edge Function

### Item 11: max_users / max_leads em companies.features
- Sao numericos, nao boolean
- Aguardam sistema de quotas dedicado (enforcement de limites, integracao com planos/billing)
- Nao podem ser representados como toggle on/off

### Item 12: companies.features coluna remanescente
- Apos Onda 1.6, companies.features ainda contem 3 campos vivos: ai_sdr_enabled, max_users, max_leads
- Coluna nao pode ser dropada inteira
- Os 8 campos migrados permanecem no JSON (dados historicos) mas nao sao mais lidos/escritos pelo codigo

---

## 7. Plano de execucao (fases)

### Fase 1: Migrations no banco
1. Aplicar migration 1 (ADD COLUMN category)
2. Aplicar migration 2 (backfill 8 flags)
3. Verificar: `SELECT feature_key, category, count(*) FROM tenant_feature_flags GROUP BY 1,2 ORDER BY 2,1` -- deve retornar 9 feature_keys distintas. Total de rows: 8 flags backfilladas x 6 empresas = 48 + 1 sdr_agent_v2 pre-existente (Veltz Group) = 49 rows

### Fase 2: Hub UI (codigo)
4. Atualizar `AVAILABLE_FEATURES` com 9 flags + categories
5. Refatorar `feature-flags-tab.tsx` para renderizar por categoria
6. Reduzir `features-tab.tsx` para 3 itens legacy com nota
7. Atualizar `company-card.tsx` para ler flags migradas de `tenant_feature_flags`
8. Atualizar `company-detail.tsx` (remover labels migrados, renomear aba)
9. Build Hub

### Fase 3: Veltzy Dashboard (codigo)
10. Editar `SdrV2Dashboard.tsx`: remover 4 KPIs + 2 colunas da tabela
11. Editar `sdr-v2-metrics.service.ts`: remover queries e calculos de custo/tokens/tools
12. Editar `src/types/sdr-v2.ts`: remover campos da interface + USD_TO_BRL se orfao
13. Build Veltzy

### Fase 4: Documentacao
14. Atualizar DEBT-Wave-1.md com itens 10-12

### Fase 5a: Commit e validacao Hub
15. Commit Hub + push
16. Validar UI Hub: aba Feature Flags com categorias, aba Legacy com 3 itens
17. PARAR e aguardar OK antes de Fase 5b

### Fase 5b: Commit e validacao Veltzy
18. Commit Veltzy + push
19. Validar UI Veltzy: dashboard com 4 KPIs, tabela sem colunas de custo/tokens

---

## 8. Checklist de aceite

### Hub
- [ ] Coluna `category` existe em `tenant_feature_flags`
- [ ] 8 flags migradas com valores preservados de `companies.features`
- [ ] Aba "Feature Flags" mostra 9 flags em 4 categorias (IA, Comunicacao, Integracoes, CRM)
- [ ] Toggles funcionam (INSERT/UPDATE)
- [ ] Aba "Legacy" mostra apenas ai_sdr_enabled, max_users, max_leads com nota explicativa
- [ ] company-card badges refletem flags de tenant_feature_flags
- [ ] Build OK

### Veltzy
- [ ] Dashboard /sdr-ia mostra 4 KPIs (conversas iniciadas, ativas, qualificacao, escaladas)
- [ ] KPIs de custo/tokens/tools removidos
- [ ] Tabela de conversas sem colunas Tokens e Custo
- [ ] Interface SdrV2Metrics nao tem campos de custo/tokens/tools
- [ ] Build OK

### Banco
- [ ] `SELECT count(*) FROM tenant_feature_flags` retorna 49 rows
- [ ] `SELECT DISTINCT category FROM tenant_feature_flags` retorna IA, Comunicacao, Integracoes, CRM
- [ ] Valores migrados batem com companies.features original (spot check Martins e Fernandes: whatsapp_enabled=true, custom_pipeline=true, representative_enabled=true)

---

## 9. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Empresa sem campo no JSON de features | COALESCE(..., false) na migration -- assume false |
| Backfill duplica dados se rodar 2x | ON CONFLICT DO NOTHING -- idempotente |
| Cache useFeatureFlag (30s) durante transicao | Delay maximo 30s. Aceitavel |
| company-card mostra badges inconsistentes durante transicao | Fase 2 atualiza leitura. Entre Fase 1 e Fase 2, badges ainda leem companies.features (correto, dados identicos) |
| Rollback necessario | SQL de rollback documentado na secao 3.3 |

---

## 10. Arquivos novos/editados (estimativa)

### Hub
- `supabase/migrations/20260601000001_tff_add_category.sql` (novo)
- `supabase/migrations/20260601000002_tff_backfill_from_companies_features.sql` (novo)
- `src/components/company/feature-flags-tab.tsx` (editar -- categorias)
- `src/components/company/features-tab.tsx` (editar -- reduzir para 3 itens legacy)
- `src/components/company/company-card.tsx` (editar -- ler de tenant_feature_flags)
- `src/pages/company-detail.tsx` (editar -- renomear aba, ajustar labels)
- `src/hooks/use-feature-flags.ts` (possivelmente editar -- se company-card precisar de hook)

### Veltzy
- `src/components/sdr-v2/dashboard/SdrV2Dashboard.tsx` (editar)
- `src/services/sdr-v2-metrics.service.ts` (editar)
- `src/types/sdr-v2.ts` (editar)
- `docs/features/sdr-ai-v2/DEBT-Wave-1.md` (editar)
