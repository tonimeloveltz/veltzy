# Spec - SDR AI v2 - Onda 1.5: Feature Flags + Controle de Visibilidade

> Feature: `sdr-ai-v2` / Onda 1.5
> Status: Em revisao
> Data: 2026-05-28

---

## 1. Objetivo

Implementar sistema de feature flags no Hub para controlar a habilitacao da feature SDR Agent v2 por empresa, com UI de controle para super admin e consumo no Veltzy (sidebar, rota, dispatch). Remover a UI legada do SDR v1 no admin.

## 2. Decisoes de arquitetura

### 2.1 Feature flags: tabela dedicada vs companies.features vs system_flags

**Opcao avaliada 1: Reutilizar `companies.features` (JSONB)**

O Veltzy ja tem `companies.features` com flags como `ai_sdr_enabled`, `whatsapp_enabled`, etc. Vantagem: zero migrations, ja existe no frontend (`CompanyFeatures` type). Desvantagem: `companies` esta no schema `veltzy`, nao no Hub. O Hub nao deveria editar tabelas do Veltzy diretamente. Alem disso, `ai_sdr_enabled` controla o SDR v1 (scoring/auto-reply), nao o agente v2.

**Opcao avaliada 2: Reutilizar `system_flags` (Hub)**

O Hub tem `system_flags` com key-value JSONB. Ja tem `ai_globally_enabled` (bool) e `ai_company_disabled` (array de UUIDs). Vantagem: existe, super admin only. Desvantagem: key-value generico, sem audit trail por empresa, dificil de listar "todas as flags da empresa X".

**Opcao avaliada 3: Nova tabela `tenant_feature_flags` (Hub) -- RECOMENDADA**

Tabela dedicada no Hub: uma row por empresa+feature. Vantagens: generica (serve pra qualquer feature futura), auditavel (updated_by, updated_at), consultavel por empresa, RLS super_admin only, funcao helper `is_feature_enabled()`. Desvantagem: nova migration no Hub.

**Decisao: Opcao 3** -- nova tabela `tenant_feature_flags` no Hub. Motivo: separacao clara Hub vs Veltzy, reutilizavel, auditavel.

### 2.2 Interacao com ai_sdr_enabled (companies.features)

- `companies.features.ai_sdr_enabled` -- continua controlando o SDR v1 (scoring, auto-reply, sdr-ai Edge Function). NAO mexemos nela.
- `tenant_feature_flags.sdr_agent_v2` -- controla exclusivamente o agente conversacional v2 (sdr-engine, pagina /sdr-ia, wizard, sandbox, dashboard).
- Sao flags independentes. Uma empresa pode ter v1 ligado e v2 desligado (default), ou ambos, ou nenhum.

### 2.3 Default quando nao ha registro

**OFF por seguranca.** Se a empresa nao tem registro em `tenant_feature_flags` para `sdr_agent_v2`, a feature esta desligada. Super admin liga explicitamente por empresa.

### 2.4 Remocao do SDR v1 (aba "IA SDR avancado" no Admin)

**Trade-off identificado:** A Onda 1 deixou backward compat: `lead-inbound-handler.ts` roteia para `sdr-ai` (v1) quando pipeline nao tem `agent_profile` ativo. Se removermos o backend v1, pipelines sem agent_profile ficam sem SDR.

**Decisao:** Remover APENAS a UI do v1 (aba "IA SDR avancado" no admin e gestao). Manter o backend v1 (`sdr-ai` Edge Function, `use-sdr-config` hook, `sdr-settings` component) intacto para backward compat. Quando TODAS as empresas tiverem migrado para v2 (futuro), faremos uma Onda de cleanup do v1.

O que remove:
- `src/components/admin/sdr-tab.tsx` -- import e renderizacao na pagina admin
- `src/pages/admin.tsx` -- tab "IA SDR avancado" e seu conteudo
- `src/pages/gestao.tsx` -- tab "IA SDR" e seu conteudo
- `src/components/admin/pipeline-sdr-config.tsx` -- se usado apenas pelo sdr-tab (verificar)

O que NAO remove (backward compat):
- `supabase/functions/sdr-ai/` -- Edge Function v1 continua funcional
- `src/hooks/use-sdr-config.ts` -- usado pelo backend
- `src/services/sdr.service.ts` -- idem
- `src/components/settings/sdr-settings.tsx` -- avaliar se ainda e acessivel por alguma rota
- `src/hooks/use-sdr-metrics.ts` e `src/services/sdr-metrics.service.ts` -- metricas v1

## 3. Schema (Hub)

### 3.1 Nova tabela: tenant_feature_flags

```sql
CREATE TABLE public.tenant_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(company_id, feature_key)
);

CREATE INDEX idx_tff_company ON public.tenant_feature_flags(company_id);
CREATE INDEX idx_tff_feature ON public.tenant_feature_flags(feature_key);

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

-- Super admin only
CREATE POLICY "tff_super_admin" ON public.tenant_feature_flags
  FOR ALL TO authenticated
  USING (is_super_admin());

-- Qualquer authenticated pode ler flags da propria empresa (para o frontend consumir)
CREATE POLICY "tff_own_company_select" ON public.tenant_feature_flags
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id());
```

### 3.2 Funcao helper

```sql
CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_company_id uuid,
  p_feature_key text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.tenant_feature_flags
     WHERE company_id = p_company_id AND feature_key = p_feature_key),
    false  -- default OFF
  );
$$;
```

### 3.3 Seed inicial

```sql
-- Nao inserir nada. Default e OFF.
-- Super admin liga manualmente por empresa via UI.
```

### 3.4 Trigger updated_at

```sql
CREATE TRIGGER trg_tff_updated_at
  BEFORE UPDATE ON public.tenant_feature_flags
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

## 4. Hub: UI de controle (super admin)

### 4.1 Onde fica

Pagina existente de gestao de empresas no Hub. Adicionar uma coluna/secao "Feature Flags" na lista de empresas, ou um modal ao clicar em uma empresa.

### 4.2 Componentes

**FeatureFlagsPanel (por empresa)**

- Lista de feature flags disponiveis (inicialmente so `sdr_agent_v2`)
- Toggle on/off por flag
- Mostra quem alterou e quando (updated_by, updated_at)
- Ao ligar: `INSERT ... ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled = true, updated_by = auth.uid()`
- Ao desligar: `UPDATE SET enabled = false, updated_by = auth.uid()`

**Constante de features disponiveis (frontend Hub)**

```ts
const AVAILABLE_FEATURES = [
  { key: 'sdr_agent_v2', label: 'SDR Agent v2 (Agente IA conversacional)', description: 'Habilita o agente SDR v2 com wizard, sandbox e dashboard' },
  // futuras features aqui
] as const
```

### 4.3 Log de auditoria

A propria tabela serve de log (updated_by + updated_at). Para historico completo de mudancas, consideramos futuramente uma tabela de audit log. Na Onda 1.5, updated_by + updated_at e suficiente.

## 5. Veltzy: consumir a flag

### 5.1 Hook: useFeatureFlag

```ts
// src/hooks/use-feature-flag.ts
export const useFeatureFlag = (featureKey: string): boolean => {
  // Busca na tabela tenant_feature_flags via supabase public schema
  // Usa React Query com staleTime: 30s (rapido o suficiente pra validacao, leve pra producao)
  // Retorna false se loading ou erro (fail-closed)
}
```

**Nota:** A tabela `tenant_feature_flags` esta no Hub (mesmo projeto Supabase, schema `public`). O Veltzy ja acessa `public.*` via `supabase` client (nao `veltzy()` client). Entao a query funciona direto.

### 5.2 Sidebar: visibilidade do item "SDR IA"

```tsx
// src/components/layout/app-sidebar.tsx
// Antes:
{ label: 'SDR IA', href: '/sdr-ia', icon: Zap, visible: canAccessAdmin || isManager }

// Depois:
{ label: 'SDR IA', href: '/sdr-ia', icon: Zap, visible: (canAccessAdmin || isManager) && isSdrAgentV2Enabled }
```

Onde `isSdrAgentV2Enabled` vem de `useFeatureFlag('sdr_agent_v2')`.

### 5.3 Rota /sdr-ia: guard

```tsx
// src/pages/sdr-ia.tsx (ou wrapper)
// Se flag OFF, redireciona para /dashboard (nao 404)
const isSdrV2 = useFeatureFlag('sdr_agent_v2')
if (!isSdrV2) return <Navigate to="/dashboard" replace />
```

### 5.4 lead-inbound-handler: checagem da flag

A checagem da flag acontece DEPOIS de verificar que existe agent_profile ativo, para evitar query extra em empresas que usam apenas v1.

```ts
// supabase/functions/_shared/lead-inbound-handler.ts
// Fluxo:
// 1. Verifica agent_profile ativo (query que ja existe)
// 2. SO SE existir agent_profile ativo, checa a flag

let useV2 = false
if (leadFull.pipeline_id) {
  const { data: agentProfile } = await supabase
    .from('agent_profiles')
    .select('id, is_active')
    .eq('pipeline_id', leadFull.pipeline_id)
    .maybeSingle()

  if (agentProfile?.is_active) {
    // Agent profile ativo: agora checa se a feature flag permite v2
    const { data: flag } = await supabasePublic
      .from('tenant_feature_flags')
      .select('enabled')
      .eq('company_id', params.companyId)
      .eq('feature_key', 'sdr_agent_v2')
      .maybeSingle()

    useV2 = !!flag?.enabled
  }
}
```

Empresas sem agent_profile ativo nao pagam a query da flag. Se agent_profile ativo mas flag OFF, fallback para v1.

## 6. Remocao da UI legada (SDR v1)

### 6.1 Arquivos a remover/editar

| Arquivo | Acao |
|---|---|
| `src/pages/admin.tsx` | Remover tab "IA SDR avancado", remover import SdrTab |
| `src/pages/gestao.tsx` | Remover tab "IA SDR", remover import SdrTab |
| `src/components/admin/sdr-tab.tsx` | Deletar arquivo |
| `src/components/admin/sdr-metrics-dashboard.tsx` | Deletar (metricas v1, substituidas pelo SdrV2Dashboard) |
| `src/components/admin/pipeline-sdr-config.tsx` | MANTER. Usado por `pipeline-tab.tsx` (config de instancia SDR por pipeline). Nao faz parte do sdr-tab |

### 6.2 Arquivos que permanecem (backward compat backend)

| Arquivo | Motivo |
|---|---|
| `supabase/functions/sdr-ai/` | Processa leads de pipelines sem agent_profile v2 |
| `src/hooks/use-sdr-config.ts` | MANTER. Usado pelo backend v1 (sdr-ai Edge Function consome a config) |
| `src/services/sdr.service.ts` | MANTER. Configuracao SDR v1, base para use-sdr-config |
| `src/hooks/use-sdr-metrics.ts` | DELETAR. Unico uso: `sdr-metrics-dashboard.tsx` (que sera deletado) |
| `src/services/sdr-metrics.service.ts` | DELETAR. Unico uso: `use-sdr-metrics.ts` (que sera deletado) |
| `src/components/settings/sdr-settings.tsx` | DELETAR. Unico uso: `sdr-tab.tsx` (que sera deletado). Nao e acessivel por nenhuma rota diretamente |

## 7. Fluxo de entrega

### 7.1 Hub (migration + UI)

1. Migration: criar tabela `tenant_feature_flags` + funcao `is_feature_enabled` + trigger
2. UI: painel de feature flags por empresa na pagina de gestao
3. Deploy Hub
4. Ligar `sdr_agent_v2` para empresa de teste (d20f7d62)

### 7.2 Veltzy (consumo da flag + cleanup)

5. Hook `useFeatureFlag`
6. Guard na sidebar e na rota /sdr-ia
7. Checagem no lead-inbound-handler
8. Remover UI legada (sdr-tab, metricas v1, tabs no admin/gestao)
9. Build + deploy

### 7.3 Validacao

10. Empresa com flag ON: ve "SDR IA" no menu, acessa /sdr-ia, sdr-engine dispara
11. Empresa com flag OFF: nao ve "SDR IA" no menu, /sdr-ia redireciona, sdr-engine nao dispara (fallback v1 se aplicavel)
12. Empresa sem registro na tabela: comportamento identico a OFF

## 8. Arquivos novos/editados (estimativa)

### Hub
- `supabase/migrations/XXXXXXXX_tenant_feature_flags.sql` (novo)
- `src/components/feature-flags/FeatureFlagsPanel.tsx` (novo)
- `src/types/database.ts` ou `src/types/feature-flags.ts` (editar/novo)
- Pagina de gestao de empresas (editar -- adicionar painel)

### Veltzy
- `src/hooks/use-feature-flag.ts` (novo)
- `src/components/layout/app-sidebar.tsx` (editar)
- `src/pages/sdr-ia.tsx` (editar -- guard)
- `supabase/functions/_shared/lead-inbound-handler.ts` (editar)
- `src/pages/admin.tsx` (editar -- remover tab)
- `src/pages/gestao.tsx` (editar -- remover tab)
- `src/components/admin/sdr-tab.tsx` (deletar)
- `src/components/admin/sdr-metrics-dashboard.tsx` (deletar)
- `src/components/settings/sdr-settings.tsx` (deletar)
- `src/hooks/use-sdr-metrics.ts` (deletar)
- `src/services/sdr-metrics.service.ts` (deletar)

## 9. Riscos

| Risco | Mitigacao |
|---|---|
| Flag OFF mas admin ja criou agent_profile | OK: agent_profile fica salvo, so nao dispara. Quando ligar, funciona |
| Latencia extra no lead-inbound-handler (query flag) | Query simples por PK composta (company_id + feature_key), < 5ms |
| Remover UI v1 enquanto backend v1 existe | UI removida, backend mantido. Admin nao pode mais configurar v1 pela UI, mas config existente continua funcionando |
| Hook useFeatureFlag com cache stale | staleTime de 30s. Pior caso: flag mudou no Hub, Veltzy mostra estado antigo por 30s |

## 10. Fora de escopo

- Historico completo de mudancas (audit log separado)
- Feature flags com expiracoes ou schedules
- Flags por usuario (so por empresa)
- Remocao do backend v1 (sdr-ai Edge Function)
- Migrar `companies.features` para `tenant_feature_flags` (futuro)
