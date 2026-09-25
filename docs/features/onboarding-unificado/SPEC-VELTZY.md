# SPEC — Onboarding Unificado · Bloco 1 (lado Veltzy)

> **Escopo desta Spec:** APENAS o ajuste mínimo do Veltzy (Fase 2a do PRD): checagem do teto de usuários do plano, lido do Hub, antes de criar convite novo.
> **Status:** RASCUNHO para consolidação pelo Copiloto. ZERO migration/código até a Spec unificada + go do Toni.
> **Autora:** Vex (Codificadora do Veltzy) · **Data:** 2026-09-01 · **Ref PRD:** `~/Downloads/PRD-onboarding-unificado.md` §4.2

---

## 1. Contexto e achado

O Veltzy **já tem** checagem de teto no convite. Este Bloco NÃO cria fluxo novo — **troca a fonte de verdade** do teto e ajusta a contagem.

- **Ponto do código:** `src/services/team.service.ts` → `inviteMember()`. Já chama, antes do insert em `invitations`:
  ```ts
  const { data: limits } = await supabase.rpc('check_company_limits', {
    p_company_id: companyId, p_type: 'users',
  })
  if (limits && !limits.allowed) {
    throw new Error(`Limite de ${limits.limit} usuarios atingido. Entre em contato para fazer upgrade.`)
  }
  ```
- **RPC atual** (`supabase/migrations/041_check_company_limits.sql`): para `p_type='users'`, lê o teto de `companies.features->>'max_users'` (default 999999 se ausente) e conta `count(*) from public.user_roles where company_id = X`.
- **Aceite de convite:** intocado. O PRD confirma que o fluxo de convite/aceite não muda de forma.

## 2. Decisões de produto (cravadas pelo Toni, 2026-09-01)

1. **Fonte única do teto** = `public.subscriptions.max_users`, por `(company_id, product='veltzy')`. Mesma tabela/canal que o Veltzy já lê hoje (`auth.store.ts` lê `subscriptions.status, plan` com `.eq('product','veltzy')`). **Não nasce contrato cross-schema novo** — depende só da coluna existir (Bloco 0 do Hub).
2. **Assento** = `count(distinct user_id)` em `public.user_roles` por `company_id` (NÃO `count(*)`, que infla com multi-papel).
3. **Precedência na transição (rota A):** `subscriptions.max_users` NULL → **fallback** para `companies.features->>'max_users'` (comportamento atual). Ninguém trava no dia do deploy.
4. **Flip fail-closed** (NULL → bloqueia com aviso) = **2º commit separado**, só após o Hub provar backfill 100%. Fora do escopo deste commit.

## 3. Mudança — RPC `check_company_limits` (p_type='users')

Nova migration `071_check_company_limits_subscriptions.sql` via `create or replace`, preservando `p_type='leads'` inalterado.

**Contrato do Bloco 0 (confirmado no staging, read-only):**
- `public.subscriptions.max_users` = **integer NULLABLE** ✅
- `public.subscriptions.product` = enum `product_slug` (labels: `veltzy`, `leadbaze`, `powerv`, `hub`, `sylo`), NOT NULL.
- **A Hera já criou `public.get_product_seat_limit(p_company_id uuid, p_product product_slug) returns integer`** — SQL STABLE SECURITY DEFINER, `search_path=''`. Corpo:
  ```sql
  select coalesce(
    (select s.max_users from public.subscriptions s
      where s.company_id = p_company_id and s.product = p_product),
    (select (c.features ->> 'max_users')::int from public.companies c
      where c.id = p_company_id)
  );
  ```
  Ou seja **a fallback subscriptions.max_users → companies.features JÁ VIVE nessa função** (fonte única, Hub-owned). O Veltzy NÃO duplica o SELECT — apenas **chama** a função.

**Lógica nova para `p_type='users'`:**

```sql
-- teto: fonte única via get_product_seat_limit (subscriptions.max_users com fallback
-- companies.features embutido na função da Hera). coalesce->999999 = transição
-- (NULL de ambas as fontes NÃO bloqueia; preserva o comportamento atual).
-- No flip fail-closed (2º commit) o coalesce vira: NULL -> allowed:false.
v_limit := coalesce(public.get_product_seat_limit(p_company_id, 'veltzy'::public.product_slug), 999999);

-- assento = usuários DISTINTOS, não linhas de papel (multi-papel não infla)
select count(distinct user_id) into v_current_count
from public.user_roles
where company_id = p_company_id;
```

- Retorno inalterado: `jsonb_build_object('allowed', v_current_count < v_limit, 'current', v_current_count, 'limit', v_limit)`.
- `p_type='leads'`: **sem alteração** (preservar o corpo vigente, que == migration 041, sem drift no staging — verificado).
- `SECURITY DEFINER` + `set search_path = public` mantidos.
- `v_features` deixa de ser usado no ramo 'users' (segue no ramo 'leads').

> **⛔ Dependência de ordem (Bloco 0 antes do Bloco 1):** esta migration referencia `public.get_product_seat_limit`, que é criada no Bloco 0 (Hera). Ela precisa existir no ambiente ANTES de aplicar a 071 — já confirmada no staging; e precisa estar no Central antes da promoção do lote.
>
> **Cardinalidade / filtro de status:** ambos resolvidos DENTRO de `get_product_seat_limit` (lookup por `(company_id, product)`, sem status). O Veltzy não reimplementa a leitura, então essas decisões ficam encapsuladas na função da Hera. Se produto quiser que sub cancelada bloqueie convite, é regra à parte (decisão do Toni) e mudaria a função da Hera, não a RPC do Veltzy.

## 4. Front — sem mudança de forma

- `inviteMember` já dá throw + o hook `use-team.ts` já superficializa o erro na UI (Gestão › Membros). Nenhuma mudança de componente.
- Copy do erro permanece "Limite de {limit} usuarios atingido. Entre em contato para fazer upgrade." (sem em-dash, pt-BR).
- O aviso específico de fail-closed ("plano sem limite, fale com suporte") entra **só no 2º commit** do flip.

## 5. Fora de escopo (deste commit)

- Flip fail-closed (2º commit, pós-backfill do Hub).
- Backfill de `subscriptions.max_users` (dono: Hub).
- Fase 1 do Hub (provisionamento, link único, magic link) e Fase 2b do Lemya.
- Diferenciar teto por plano (nasce igual ao atual; refinamento futuro).

## 6. Testes / PVO

### 6.1 Unit da RPC (SQL, no SQL Editor de staging — nunca Central)

Setup comum: 1 company `C`, 1 row em `public.subscriptions(company_id=C, product='veltzy')`, N usuários em `public.user_roles(company_id=C)`. Cada caso zera e recria o estado. Assert sobre o JSON de `check_company_limits(C, 'users')`.

**Status: ✅ EXECUTADO no staging (hfebv) 2026-09-02 — 5/5 passaram.** Rodado num bloco transacional com `RAISE EXCEPTION` ao final (rollback total → zero residue confirmado: companies/users/subscriptions de teste = 0).

| # | Cenário | Setup | Esperado | Obtido | O que prova |
|---|---|---|---|---|---|
| T1 | **Teto batido pela fonte nova (caminho primário)** | `subscriptions.max_users=3`; 3 user_ids distintos com company_id=C | `{allowed:false, current:3, limit:3}` | `{limit:3, allowed:false, current:3}` ✅ | `limit` veio de `subscriptions.max_users` (3), **não** do 999999 do fallback nem de `companies.features`. Bloqueia no limite. |
| T2 | **Caso saudável sob o teto** | `subscriptions.max_users=5`; 2 user_ids (admin, seller) em company_id=C | `{allowed:true, current:2, limit:5}` | `{limit:5, allowed:true, current:2}` ✅ | Contagem correta e libera sob o teto. |
| T3 | **Fallback na transição (max_users NULL)** | `subscriptions.max_users=NULL`; `companies.features->>'max_users'=5`; 4 user_ids distintos | `{allowed:true, current:4, limit:5}` | `{limit:5, allowed:true, current:4}` ✅ | NULL cai no fallback `companies.features` (via `get_product_seat_limit`) → ninguém trava no deploy. `limit` vem do features. |
| T4 | **Admin-1 carimbado conta; role genérica NULL não conta** | `subscriptions.max_users=1`; user A = row(admin, company_id=C); user Z = row(seller, company_id=**NULL**) | `{allowed:false, current:1, limit:1}` | `{limit:1, allowed:false, current:1}` ✅ | (a) admin carimbado contado (senão `current=0`); (b) a role genérica `company_id=NULL` de OUTRO usuário **não** é contada (`WHERE company_id=C` exclui NULL). Prova o Anexo A. |
| T5 | **Fronteira — sem row de subscription** | nenhuma subscription para `(C,'veltzy')`; `features.max_users=5`; 2 user_ids | `{allowed:true, current:2, limit:5}` | `{limit:5, allowed:true, current:2}` ✅ | `get_product_seat_limit` sem subscription → fallback features. Cobre empresa legada antes do backfill. |

> **⚠️ Achado (schema real, staging):** existe `CREATE UNIQUE INDEX idx_user_roles_unique_company ON user_roles(user_id, company_id) WHERE company_id IS NOT NULL`. Ou seja, **numa empresa (company_id não-nulo) um usuário tem no máximo 1 papel** — multi-papel na mesma empresa é impossível no schema. Consequência: `count(distinct user_id)` e `count(*)` são **equivalentes por empresa** aqui. A escolha por `count(distinct user_id)` (decisão do Toni) segue correta e defensiva (robusta se o índice parcial for removido no futuro), mas **não é load-bearing** no schema atual — a premissa "multi-papel infla o teto" não se realiza. Registrado para não vender o T2 como prova do distinct (foi reformulado para caso saudável). O índice parcial permite múltiplas linhas com `company_id=NULL` (a role genérica), coerente com o Anexo A / T4.

### 6.2 Front (staging, preview)
- Convite acima do teto → UI de Gestão › Membros exibe o erro "Limite de {limit} usuarios atingido..." e **não** insere em `invitations` nem chama `send-invite-email`.
- Convite dentro do teto → fluxo normal (insert + e-mail).
- Sem mudança de forma/componente (o throw + surfacing já existem).

### 6.3 Build
`npm run build` verde (tsc -b) antes do PR.

### 6.4 Fora deste PVO (fica pro flip fail-closed, 2º commit)
- `subscriptions.max_users` NULL **pós-backfill** → bloqueia com aviso "plano sem limite, fale com suporte". Só testar quando o fallback for removido.

## 7. Rollout (git flow)

1. Branch `feat/teto-convite-subscriptions` a partir de `develop` limpo (HEAD == origin/develop).
2. Migration `create or replace` + (nenhuma mudança de front).
3. `npm run build` verde → PR para `develop` → validação no staging.
4. Promoção `develop→main` = go humano do Toni (Central/prod).
5. 2º commit (flip fail-closed) agendado após backfill 100% provado pelo Hub.

---

**Gates ativos (não iniciar código):** Spec unificada consolidada (Copiloto) + go do Toni + Bloco 0 (coluna `max_users` pela Hera) existindo no Central.

---

## Anexo A — Contrato de seed do Veltzy no `provision-company` (Fase 1, dono: Hub)

> Contexto pro provisionamento criar uma empresa Veltzy **funcional** (blurb "seu funil já está pronto"). Mapeado contra os triggers REAIS do Central (validado pelo Copiloto). O Veltzy **não precisa de um seed_org como o Lemya** — o funil vem de graça por trigger.

**O que o `provision-company` faz (3 passos, todos em `public.*` + cascata de trigger):**

1. `INSERT INTO public.companies(name, slug, ...)` → dispara `AFTER INSERT ON public.companies` a função **`setup_veltzy_for_company()`** (uma função que chama `create_default_pipeline` + `create_default_sources`) **+** trigger separado `veltzy.create_default_settings()`. Resultado automático:
   - `pipelines`: "Pipeline Principal" (is_default=true) + **6 `pipeline_stages`** (Novo Lead → Qualificando → Em Negociação → Proposta Enviada → Fechado (Ganho) → Perdido).
   - `lead_sources`: WhatsApp, Instagram, Manual.
   - `system_settings`: theme_config, sdr_config (enabled:false), business_rules.
   - ✅ Invariante blurb↔seed satisfeita.
2. Criar o usuário via Admin API → dispara `handle_new_user` (trigger em `auth.users`): cria `profiles(user_id, email, name)` + `user_roles(user_id, 'seller')` com **company_id NULL** (papel genérico global, por design; o accept_invitation preserva essa genérica de propósito).
3. `UPDATE public.profiles SET company_id = <nova company> WHERE user_id = <admin>` **+ `INSERT INTO public.user_roles(user_id, company_id, role='admin')` EXPLÍCITO.**

**Correções vs premissa inicial (registradas pra não repetir):**
- ❌ NÃO existe trigger `assign_admin_role_on_first_company`. O "primeiro vira admin" é lógica **dentro da RPC `accept_invitation`**, não trigger. Como o `provision-company` não passa por `accept_invitation`, ele **tem que inserir o `user_roles(admin, company_id)` explícito** (passo 3). Isso, de quebra, mata o risco de `company_id` NULL — o provision carimba `company_id` direto.
- A role 'seller' genérica (company_id NULL) do `handle_new_user` **não precisa ser limpa**: é o modelo. O teto do Bloco 1 (`count(distinct user_id) WHERE company_id = X`) não conta o seller genérico (NULL fica de fora), então não infla nem exige faxina.

**Impacto no Bloco 1 (teto):** nenhum delta de código no Veltzy. Só confirma que a base de contagem (`user_roles` carimbados com `company_id`) é consistente quando o admin-1 é criado com `company_id` explícito no provision.
