# SPEC: Agente de prospecção em grupos de WhatsApp

Trilha: G
Início: 2026-10-05 19:44
Merge: (preencher no merge)

> Segunda etapa da trilha G. PRD em `specs/agente-grupos-whatsapp/PRD.md` (revisado). Esta SPEC traz migrations SQL completas, RLS por tabela, contrato entre repos e ordem de execução, em **blocos separados por repo (Hub primeiro)**. **Aprovada pelo Toni com as correções desta versão.**

## Schema confirmado (contra a codebase real)
- `companies` vive em **`public.companies`** → todas as FKs `company_id` apontam para `public.companies(id)`.
- Funções RLS no schema `veltzy`: **`veltzy.get_current_company_id()`**, **`veltzy.is_super_admin()`**, **`veltzy.is_company_admin()`**, `veltzy.is_admin_or_manager()` (convenção das migrations 054/067).
- Tabelas de domínio em `veltzy`: `veltzy.leads` (010), `veltzy.deals` (054), `veltzy.tasks` (015). `system_flags` e `ai_usage` em `public`.
- Segredos de runtime no **Vault** (`vault.secrets`, wrappers de `20260804151000_ai_secret_wrappers.sql`). **Proibido `current_setting('app.*')` / `ALTER DATABASE SET`.**
- `handleInboundMessage` tem `skipSideEffects`, mas ele **insere a mensagem inbound antes** do bloco de efeitos e, quando ligado, **não cria deal** → **não serve para a DM**. Por isso o item 3 usa **função estreita nova**.

---

## Contexto

Feature oculta por-empresa (v1 só a Veltz). Sessão WAHA **dedicada** (número novo) escuta grupos, classifica com **Jev** (fallback Haiku), manda **uma** DM ao autor e cria contato+deal numa pipeline de prospecção. Resposta cai no inbox; humano assume. Guardrails obrigatórios. Sombra antes de ligar a DM automática.

Reaproveita sem tocar: `_shared/phone.ts::normalizePhoneBR`, Hub `waha-send-message`, Hub `ai-complete` (Haiku), `check_ai_access()`/`increment_ai_spend()`/`ai_usage`/`tenant_ai_config`. **Não altera** `waha-inbound`, `waha-webhook-receiver`, `whatsapp-send`, `process-message-queue`, `lead-inbound-handler` (só importa).

---

## Contrato entre repos e ordem de execução

```
HUB (primeiro)                                   VELTZY (depois, só blocos liberados)
H1 migrations schema veltzy (tabelas+RLS+fns) ─┐
H2 flag oculta prospect_groups_enabled         │
H3 ai-decide (Jev→Haiku fallback) + config ────┼─► V1 DecisionClient + prospect-classify
H4 secret HMAC + sessão dedicada + webhook ────┼─► V2 prospect-group-inbound (verify_jwt=false)
H5 waha-send-message aceita sessão dedicada ───┼─► V3 prospect-dm-send
H6 cron config + jobs (janelas + purga) ───────┼─► V4 crons (edges)
H7 seed staging (pipeline/source/critério)     └─► V5 UI oculta
```

**Bloqueadores (a Copiloto NÃO libera antes):**
- `prospect-classify` (V1) → só após `ai-decide` (H3).
- `prospect-group-inbound` (V2) → só após sessão dedicada provisionada apontando para ele (H4).
- `prospect-dm-send` (V3) → só após `waha-send-message` validado com a sessão dedicada (H5).
- **Flag em produção / sombra com grupos reais** → só com **DPA da TypeSafe assinado** + **OK explícito** do Toni.
- **DM automática** → só com critério do sombra (precisão ≥0,90; resolução ≥70%) + **OK do Toni**.

---

# BLOCO HUB (primeiro)

Aplicado no **staging** via CLI, tipos regenerados, antes de qualquer dependência Veltzy. Nome por timestamp (`supabase migration new`); conteúdo abaixo. `pg_cron` e `pg_net` habilitados.

## H1. Migrations — schema `veltzy`

> **Idempotência (aplicar direto no staging com drift):** `create table if not exists` e `create index if not exists` já cobrem tabelas/índices. Para **policies e triggers**, preceder cada `create policy`/`create trigger` com o `drop ... if exists` correspondente (ex.: `drop policy if exists prospect_config_sel on veltzy.prospect_config;`). `create or replace function` já é idempotente. Assim o apply pode rodar mais de uma vez sem erro "already exists".

### H1.1 `prospect_config`
```sql
create table if not exists veltzy.prospect_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  is_enabled boolean not null default false,          -- kill switch por empresa
  shadow_mode boolean not null default true,          -- true = classifica, NÃO envia (bloqueia TODO envio)
  dm_auto_enabled boolean not null default false,     -- bloqueia só o envio AUTOMÁTICO
  engine text not null default 'noweb' check (engine in ('webjs','noweb')),
  daily_dm_cap int not null default 3,                -- rampa inicial (semana 1)
  daily_dm_ceiling int not null default 15,           -- teto final
  warmup jsonb not null default '{"week1":3,"week2":8,"week3":15}'::jsonb,
  business_hours jsonb not null default '{"start":"09:00","end":"18:00","tz":"America/Sao_Paulo"}'::jsonb,
  min_interval_seconds int not null default 120,
  max_interval_seconds int not null default 600,
  updated_at timestamptz not null default now()
);
alter table veltzy.prospect_config enable row level security;
create policy prospect_config_sel on veltzy.prospect_config for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
create policy prospect_config_ins on veltzy.prospect_config for insert with check (veltzy.is_super_admin());
create policy prospect_config_upd on veltzy.prospect_config for update using (veltzy.is_super_admin()) with check (veltzy.is_super_admin());
create policy prospect_config_del on veltzy.prospect_config for delete using (veltzy.is_super_admin());
```

### H1.2 `prospect_criteria`
```sql
create table if not exists veltzy.prospect_criteria (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  niche text not null,
  questions jsonb not null,                           -- map Jev: is_opportunity/category/urgency
  threshold_auto numeric(5,4) not null default 0.9,
  threshold_review numeric(5,4) not null default 0.6,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (company_id, niche)
);
alter table veltzy.prospect_criteria enable row level security;
create policy prospect_criteria_sel on veltzy.prospect_criteria for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
create policy prospect_criteria_ins on veltzy.prospect_criteria for insert with check (veltzy.is_super_admin());
create policy prospect_criteria_upd on veltzy.prospect_criteria for update using (veltzy.is_super_admin()) with check (veltzy.is_super_admin());
create policy prospect_criteria_del on veltzy.prospect_criteria for delete using (veltzy.is_super_admin());
```

### H1.3 `prospect_groups`
```sql
create table if not exists veltzy.prospect_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_name text not null,
  group_jid text,
  name text not null,
  invite_code text,
  niche text,
  is_active boolean not null default true,
  messages_read int not null default 0,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, group_jid)
);
create index if not exists idx_prospect_groups_company on veltzy.prospect_groups(company_id);
create index if not exists idx_prospect_groups_session on veltzy.prospect_groups(session_name);
alter table veltzy.prospect_groups enable row level security;
create policy prospect_groups_sel on veltzy.prospect_groups for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
create policy prospect_groups_write on veltzy.prospect_groups for all
  using (company_id = veltzy.get_current_company_id() and veltzy.is_company_admin() or veltzy.is_super_admin())
  with check (company_id = veltzy.get_current_company_id() and veltzy.is_company_admin() or veltzy.is_super_admin());
```

### H1.4 `prospect_group_messages_raw` — janela bruta, dedup engine-independente, retenção 7d
```sql
create table if not exists veltzy.prospect_group_messages_raw (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid references veltzy.prospect_groups(id) on delete cascade,
  group_jid text not null,
  session_name text not null,                         -- sessão/engine que entregou (metrica por engine)
  engine text check (engine in ('webjs','noweb')),
  message_external_id text not null,                  -- id da mensagem WA (igual entre engines)
  author_identifier text,                             -- phone@c.us ou @lid (cru)
  author_key text,                                    -- identidade NORMALIZADA (engine-independente)
  author_phone_resolved text,                         -- 55+DDD+num, se resolvido
  text text,
  window_context jsonb,
  classified boolean not null default false,
  received_at timestamptz not null default now(),
  -- dedup por ENGINE (permite 2 engines p/ metrica); o classify deduplica logicamente por (group_jid, message_external_id, author_key)
  unique (company_id, group_jid, message_external_id, engine)
);
create index if not exists idx_prospect_raw_pending on veltzy.prospect_group_messages_raw(company_id, classified, received_at);
create index if not exists idx_prospect_raw_dedup on veltzy.prospect_group_messages_raw(company_id, group_jid, message_external_id, author_key);
create index if not exists idx_prospect_raw_purge on veltzy.prospect_group_messages_raw(received_at);
alter table veltzy.prospect_group_messages_raw enable row level security;
create policy prospect_raw_sel on veltzy.prospect_group_messages_raw for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
-- escrita só via service_role (edges). Sem policy de insert/update p/ authenticated.
```

### H1.5 `prospect_signals` — update restrito por trigger + RPC de review
```sql
create table if not exists veltzy.prospect_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references veltzy.prospect_groups(id) on delete cascade,
  message_external_id text not null,
  author_identifier text,
  author_phone_resolved text,
  snippet text not null,                              -- só o trecho que gerou o sinal (permanece após purga)
  is_opportunity boolean,
  category text,
  urgency int,
  probability numeric(5,4),
  confidence numeric(5,4),
  provider text,                                      -- 'jev' | 'anthropic' (quem respondeu)
  decision text not null check (decision in ('auto_dm','review','alert','discard')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','sent','expired')),
  shadow boolean not null default true,
  human_label boolean,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  lead_id uuid references veltzy.leads(id),
  deal_id uuid references veltzy.deals(id),
  created_at timestamptz not null default now(),
  unique (company_id, message_external_id)
);
create index if not exists idx_prospect_signals_queue on veltzy.prospect_signals(company_id, decision, status, created_at);
alter table veltzy.prospect_signals enable row level security;
create policy prospect_signals_sel on veltzy.prospect_signals for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
create policy prospect_signals_upd on veltzy.prospect_signals for update
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin())
  with check (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
-- insert só via service_role.

-- Guard de coluna: usuário só muda human_label/reviewed_by/reviewed_at; decision/status/etc só via edge (service_role → auth.uid() null).
create or replace function veltzy.prospect_signals_guard() returns trigger
language plpgsql security definer set search_path = public, veltzy as $$
begin
  if auth.uid() is null then return new; end if;   -- service_role: libera
  if new.decision is distinct from old.decision
     or new.status is distinct from old.status
     or new.is_opportunity is distinct from old.is_opportunity
     or new.category is distinct from old.category
     or new.urgency is distinct from old.urgency
     or new.probability is distinct from old.probability
     or new.confidence is distinct from old.confidence
     or new.provider is distinct from old.provider
     or new.snippet is distinct from old.snippet
     or new.shadow is distinct from old.shadow
     or new.lead_id is distinct from old.lead_id
     or new.deal_id is distinct from old.deal_id
     or new.author_identifier is distinct from old.author_identifier
     or new.author_phone_resolved is distinct from old.author_phone_resolved
     or new.message_external_id is distinct from old.message_external_id
     or new.group_id is distinct from old.group_id
     or new.company_id is distinct from old.company_id then
    raise exception 'prospect_signals: usuario so pode alterar human_label/reviewed_by/reviewed_at';
  end if;
  return new;
end $$;
create trigger trg_prospect_signals_guard before update on veltzy.prospect_signals
  for each row execute function veltzy.prospect_signals_guard();

-- Caminho limpo da UI para rotular (sombra) / revisar
create or replace function veltzy.prospect_review_signal(p_signal_id uuid, p_human_label boolean) returns void
language plpgsql security definer set search_path = public, veltzy as $$
begin
  update veltzy.prospect_signals
     set human_label = p_human_label, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_signal_id and (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
  if not found then raise exception 'sinal nao encontrado ou sem acesso'; end if;
end $$;
```

### H1.6 `prospect_dm_log`
```sql
create table if not exists veltzy.prospect_dm_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  signal_id uuid not null references veltzy.prospect_signals(id) on delete cascade,
  session_name text not null,
  to_phone text,
  to_identifier text,
  message_text text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','blocked')),
  waha_external_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospect_dm_log_company on veltzy.prospect_dm_log(company_id, created_at);
alter table veltzy.prospect_dm_log enable row level security;
create policy prospect_dm_log_sel on veltzy.prospect_dm_log for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
-- escrita só via service_role.
```

### H1.7 `prospect_contacted` — ledger "um contato por pessoa, pra sempre"
```sql
create table if not exists veltzy.prospect_contacted (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_key text not null,                           -- lead_id::text OU sha256(telefone)
  first_contacted_at timestamptz not null default now(),
  responded boolean not null default false,
  unique (company_id, person_key)
);
alter table veltzy.prospect_contacted enable row level security;
create policy prospect_contacted_sel on veltzy.prospect_contacted for select
  using (company_id = veltzy.get_current_company_id() or veltzy.is_super_admin());
-- escrita só via service_role.
```

### H1.8 Kill switch global
```sql
-- public.system_flags = (key text, value jsonb); NÃO tem coluna description.
insert into public.system_flags (key, value)
values ('prospect_globally_enabled', 'true'::jsonb)
on conflict (key) do nothing;
```

## H2. Flag oculta `prospect_groups_enabled`
- **Não** adicionar a `AVAILABLE_FEATURES` em `hub/src/components/company/feature-flags-tab.tsx`.
- Adicionar `prospect_groups_enabled?: boolean` ao default em `hub/src/types/database.ts` (`DEFAULT_COMPANY_FEATURES`).
- Ligar só na Veltz **no staging** (não em migration): `update public.companies set features = features || '{"prospect_groups_enabled":true}'::jsonb where id = '<veltz-company-id>';`

## H3. `ai-decide` — decisão tipada, funcional SEM `TYPESAFE_API_KEY`
Nova edge `hub/supabase/functions/ai-decide/index.ts` (+ `_shared/jev.ts`, `_shared/anthropic-decision.ts`). **Não** altera `ai-complete`. `config.toml`: `verify_jwt = false` + validação de `SERVICE_ROLE` no header (padrão `ai-complete`).

Entrada `{ company_id, product:'veltzy', feature, state, questions }` → Saída `{ ok, data:{ answers, provider, model, usage } }`.
Lógica: (1) `check_ai_access`; (2) resolve provider/model por `product+feature` (reusa `resolver.ts`); (3) **se `provider==='jev'` e `TYPESAFE_API_KEY` existe → `callJev` (POST `https://api.typesafe.ai/v1/systemone`, Bearer, body `{state,questions}`); senão → fallback Haiku (`callAnthropicDecision`, tool-calling com schema derivado de `questions`)**; (4) `increment_ai_spend` + insert `ai_usage` com **o provider que respondeu** (Jev: `input_tokens/1e6*0.042`, output 0; Haiku: `MODEL_PRICES`). **Sem o secret, opera 100% no Haiku** e grava `provider='anthropic'`; com o secret + config `jev`, usa Jev **sem redeploy**.

## H4. Secret HMAC + sessão dedicada + webhook
- Secret `PROSPECT_WAHA_WEBHOOK_HMAC` (Vault/Supabase secret).
- Provisionar sessão dedicada (número novo) via WAHA API: `webhooks[].url = <CENTRAL>/functions/v1/prospect-group-inbound`, `events` com **mensagens de grupo** (`message`/`message.any`), **sem** passar pelo `waha-webhook-receiver`; `webhooks[].hmac.key = PROSPECT_WAHA_WEBHOOK_HMAC`. Registrar em `waha_instances` isolada do roteamento por `product`. **Toni pareia o QR.** Sombra: WEBJS e NOWEB como **dois dispositivos do mesmo número**.
- **Gate do B1 (`waha-instance-manage`):** essa edge recusa criação de sessão por **super_admin HUMANO** quando `companies.whatsapp_categories.waha=false`; **`service_role` NÃO é barrado**. → Provisionar a sessão dedicada **via `service_role` (máquina)**, **ou** garantir `whatsapp_categories.waha=true` na Veltz antes. O pareamento do QR pelo Toni é só leitura do QR (não recria a sessão).

## H5. `waha-send-message` aceita a sessão dedicada
Verificar o gate por `product`/categoria. Se barrar a sessão dedicada, liberar (**bloco do Hub**). Vale para a DM e para a resposta do vendedor pelo inbox.

## H6. Cron — tabela de config + jobs (sem `app.*`, sem URL fixa na migration)
```sql
create table if not exists veltzy.prospect_cron_config (
  job_key text primary key,              -- 'process_windows'
  edge_url text,                         -- NULL/'' em producao ate OK do Toni
  cron_secret text,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table veltzy.prospect_cron_config enable row level security;
create policy prospect_cron_config_su on veltzy.prospect_cron_config for all
  using (veltzy.is_super_admin()) with check (veltzy.is_super_admin());

-- job de janelas: lê config e faz RETURN sem chamar se url nula/vazia/desabilitada
create or replace function veltzy.prospect_run_process_windows() returns void
language plpgsql security definer set search_path = public, veltzy as $$
declare cfg veltzy.prospect_cron_config;
begin
  select * into cfg from veltzy.prospect_cron_config where job_key = 'process_windows';
  if cfg.job_key is null or cfg.edge_url is null or cfg.edge_url = '' or not cfg.is_enabled then
    return;  -- guard
  end if;
  perform net.http_post(
    url := cfg.edge_url,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', coalesce(cfg.cron_secret,'')),
    body := '{}'::jsonb);
end $$;

-- purga raw > 7d + ANONIMIZA sinais > 7d sem lead_id (snippet permanece)
create or replace function veltzy.prospect_purge_raw() returns void
language plpgsql security definer set search_path = public, veltzy as $$
begin
  delete from veltzy.prospect_group_messages_raw where received_at < now() - interval '7 days';
  update veltzy.prospect_signals
     set author_phone_resolved = null, author_identifier = null
   where created_at < now() - interval '7 days' and lead_id is null
     and (author_phone_resolved is not null or author_identifier is not null);
end $$;

select cron.schedule('prospect-process-windows','*/5 * * * *', $$ select veltzy.prospect_run_process_windows() $$);
select cron.schedule('prospect-purge-raw','0 3 * * *', $$ select veltzy.prospect_purge_raw() $$);
```
> **Agendamento DEFERIDO pro V4** (o classificador barra job recorrente em staging compartilhado): os `cron.schedule` ficam no arquivo de migration mas **não são agendados agora**. Agendar quando a edge `prospect-process-windows` existir (V4), com go do Toni. O guard de URL vazia em `prospect_run_process_windows()` garante no-op até lá; a purga roda quando agendada.
**Popular só no staging** (fora de migration; em prod fica vazio/`is_enabled=false` até OK do Toni):
```sql
insert into veltzy.prospect_cron_config(job_key, edge_url, cron_secret, is_enabled)
values ('process_windows', 'https://<staging-ref>.supabase.co/functions/v1/prospect-process-windows', '<cron_secret>', true)
on conflict (job_key) do update set edge_url=excluded.edge_url, cron_secret=excluded.cron_secret, is_enabled=excluded.is_enabled, updated_at=now();
```

## H7. Seed (staging, para a Veltz)
Em SQL no staging (não em migration): pipeline **"Prospecção grupos"** (+ stages) e `lead_source` **"grupo-whatsapp"**; `prospect_config` da Veltz (shadow_mode=true, is_enabled=true, dm_auto_enabled=false); `prospect_criteria` nicho **consultoria** com `questions` (is_opportunity noul / category choice / urgency score) e limiares (auto 0.9, review 0.6). A pipeline de Prospecção nasce **sem SDR** (sem `sdr_instance_name`).

## H — Arquivos
<!-- arquivos -->
supabase/migrations/<ts>_prospect_1_config.sql
supabase/migrations/<ts>_prospect_2_criteria.sql
supabase/migrations/<ts>_prospect_3_groups.sql
supabase/migrations/<ts>_prospect_4_messages_raw.sql
supabase/migrations/<ts>_prospect_5_signals.sql
supabase/migrations/<ts>_prospect_6_dm_log.sql
supabase/migrations/<ts>_prospect_7_contacted.sql
supabase/migrations/<ts>_prospect_8_global_flag.sql
supabase/migrations/<ts>_prospect_9_cron.sql
supabase/functions/ai-decide/index.ts
supabase/functions/_shared/jev.ts
supabase/functions/_shared/anthropic-decision.ts
supabase/config.toml
src/types/database.ts
<!-- /arquivos -->

---

# BLOCO VELTZY (depois — só blocos liberados)

Branch `feature/agente-grupos-whatsapp` a partir da `develop`. `npm run preflight` antes (falhou → para). Atualiza tipos após H1.

## V1. DecisionClient + `prospect-classify` *(após H3)*
- `_shared/decision-client.ts`: espelha `hub-client.ts`; `decide({company_id, product:'veltzy', feature, state, questions})` → `POST <HUB>/functions/v1/ai-decide` (Bearer SERVICE_ROLE + `x-veltzy-company-id`).
- `prospect-classify/index.ts`: carrega `prospect_criteria.questions`, monta `state` **sem PII** (`{target, context:[...]}`), chama `decide`, devolve `{is_opportunity, category, urgency, probability, confidence, provider}`.

## V2. `prospect-group-inbound` *(após H4)*
- `config.toml`: **`verify_jwt = false`**. Valida **HMAC-SHA512** do corpo cru com `PROSPECT_WAHA_WEBHOOK_HMAC` vs header `X-Webhook-Hmac` (comparação constante); falhou → 401.
- **Grupo (`@g.us`)**: pré-filtro determinístico (`_shared/prospect-prefilter.ts`: mídia sem texto; < 15 chars; do próprio número; autor já em `prospect_contacted`; lead com `marketing_opt_out`); resolve telefone **por-payload** (`_shared/prospect-phone-resolve.ts`: `participant`→`participantAlt`/`remoteJidAlt`, strip `@c.us|@lid|@s.whatsapp.net`). **Fallback por-API (`groups/{id}/participants/v2` + Contacts-LIDs) DEFERIDO** — Veltzy não fala com a WAHA direto; exige **edge nova no Hub (`waha-group-participants`)** = necessidade registrada ao copiloto do Hub. Até lá, **LID puro → `author_phone_resolved=null`** → `author_key` = identificador sem sufixo → V4 trata em **modo alerta** (sem telefone DM-able). Calcula `author_key`; **upsert** em `prospect_group_messages_raw` com `session_name`/`engine`; incrementa `messages_read`.
- **engine do raw:** `waha_instances` **NÃO** tem coluna `engine`; deriva do **`session_name`** (as 2 sessões-sombra codificam a engine no nome — convenção fixada no H4, ex.: `…-webjs`/`…-noweb`), fallback `prospect_config.engine`. A chave do webhook (`payload.session`) dá a sessão → engine.
- **1:1 (resposta à DM)**: `handleInboundMessage()` com `instanceName=<sessão dedicada>`, `whatsapp_provider='waha'` → loga a mensagem real + inbox. **Sem SDR** (a pipeline de Prospecção não tem SDR; aceite 2 cobre). Detecta **SAIR/PARE** (reusa `isOptOutMessage`) → `marketing_opt_out=true` + `prospect_contacted.responded=true` + bloqueio.
- **Nunca** grava mensagem de grupo como 1:1 (grupo só vai para `raw`/`signals`).

## V3. `prospect-dm-send` *(após H5)*
Dois modos, `config.toml` com `verify_jwt=true` (service_role e JWT de usuário passam):
- **Automático** (chamado por `prospect-process-windows`, service_role): exige `dm_auto_enabled=true`.
- **Manual** (chamado pela UI com **JWT do usuário**): valida papel **admin/super_admin**; **ignora `dm_auto_enabled`**.
- **Ambos**: `shadow_mode=true` **bloqueia** (nenhum envio); + kill switch empresa+global, horário comercial, teto/rampa do dia (via `prospect_dm_log`), intervalo/jitter, `prospect_contacted` (1x), opt-out.
- Envio via **Hub `waha-send-message`** (`providers/waha-hub.ts`, sessão dedicada). Grava `prospect_dm_log`; registra `prospect_contacted`; cria contato+deal pela **função estreita** `_shared/prospect-create-lead-deal.ts` (lead upsert + deal com `pipelineId`/`sourceId`/`tags:['grupo:<nome>']`/`instanceName`; **sem insert em `messages`, sem SDR/SLA/fila**); preenche `signal.lead_id/deal_id`, `status='sent'`.
- **Texto da DM — dm-send é agnóstico à composição**: recebe `{signal_id, message_text}` nos **dois modos**. Valida `message_text` **não-vazio E contendo o opt-out** (`SAIR`/`PARE`, case-insensitive) — garantia obrigatória no gate de envio, independente de quem compôs. A **composição** (Haiku via `ai-complete`, feature `prospect_dm_message`; identifica a Veltz + cita o contexto do grupo + SAIR/PARE) vive em `_shared/prospect-compose-dm.ts`: o **V4** compõe antes de chamar o dm-send (auto); a **UI (V5)** gera o rascunho pro admin editar/aprovar via edge thin (`verify_jwt=true` + papel admin → `ai-complete`). Request: auto `{signal_id, message_text}`+service_role; manual `{signal_id, message_text}`+JWT admin/super_admin.

## V4. Crons (edges) *(após H6)*
- `prospect-process-windows/index.ts` (`verify_jwt=false` + `x-cron-secret`): lê `raw` `classified=false` por grupo, **deduplica logicamente por `(group_jid, message_external_id, author_key)`** (engine-independente; prefere linha com telefone resolvido), monta janelas, chama `prospect-classify`, grava `prospect_signals` por faixa (`auto_dm`/`review`/`alert`/`discard`); se `auto_dm` e guardrails OK e **não shadow** → invoca `prospect-dm-send` (automático); marca raw `classified=true`.
- **Modo alerta** (resolução < 70% ou sem telefone DM-able): `decision='alert'`, **cria tarefa em `veltzy.tasks`** para o Toni (grupo + trecho + link para o sinal) + aparece na aba Alerta. Sem DM.
- Purga/anonimização: no cron SQL (H6).

## V5. UI oculta *(após H1; dados reais após V2+)*
Gate `useAuthStore(s => s.company?.features?.prospect_groups_enabled)`.
- `pages/prospeccao.tsx` + rota: **Grupos** (entrar via invite link, ativar/desativar, nicho, kill switch empresa, indicadores), **Fila de sinais** (faixa `review`: Aprovar → chama `prospect-dm-send` **manual com JWT**; Rejeitar; abas auto-enviados/descartados/**Alerta** com botão **"Abordei"** → cria lead+deal pela mesma `prospect-create-lead-deal`), **Sombra/rotulagem** (lista shadow; botão é/não-é → RPC `prospect_review_signal`; Jev vs humano; taxa de resolução por engine), **Métricas** (lidas, sinais por faixa, DMs, respostas, taxa).
- `prospect.service.ts` (leitura via RLS; review via RPC `prospect_review_signal`), hooks `use-prospect-*`, item de menu no sidebar atrás da flag.
- **2 edges thin (browser não chama `ai-complete`/`_shared` direto)**, `verify_jwt=true` + papel admin/super_admin da empresa do sinal:
  - `prospect-dm-draft`: `{signal_id}` → `composeProspectDm` (Haiku) → devolve rascunho pro admin **editar** antes de Aprovar; o Aprovar chama `prospect-dm-send` (manual) com o texto final.
  - `prospect-approach`: botão **"Abordei"** da aba Alerta → `prospectCreateLeadDeal` + marca `signal.status` + reserva `prospect_contacted` (mesma chave estável), **sem** enviar DM.

## V — Arquivos
<!-- arquivos -->
src/types/database.ts
supabase/functions/_shared/decision-client.ts
supabase/functions/_shared/prospect-prefilter.ts
supabase/functions/_shared/prospect-phone-resolve.ts
supabase/functions/_shared/prospect-create-lead-deal.ts
supabase/functions/_shared/prospect-compose-dm.ts
supabase/functions/prospect-classify/index.ts
supabase/functions/prospect-group-inbound/index.ts
supabase/functions/prospect-dm-send/index.ts
supabase/functions/prospect-process-windows/index.ts
supabase/functions/prospect-dm-draft/index.ts
supabase/functions/prospect-approach/index.ts
supabase/config.toml
src/pages/prospeccao.tsx
src/services/prospect.service.ts
src/hooks/use-prospect-groups.ts
src/hooks/use-prospect-signals.ts
src/components/prospect/groups-panel.tsx
src/components/prospect/signals-queue.tsx
src/components/prospect/shadow-labeling.tsx
src/components/prospect/prospect-metrics.tsx
src/components/layout/app-sidebar.tsx
src/App.tsx
<!-- /arquivos -->

---

## Contratos não óbvios
- **JevQuestion:** `noul {criteria:{true,false}}` · `choice {instructions, criteria:Record<string,string>}` (≤255) · `score {instructions, criteria}` (2..10). **state (sem PII):** `{target:string, context:string[]}`.
- **probability/confidence (origem = modelo, não fórmula):** `probability` = valor do **noul `is_opportunity` (0..1)**; `confidence` = confidence da resposta. O `ai-decide` deve **emitir ambos** (Jev nativo; no fallback Haiku, estender o tool-schema p/ pedir número 0..1 + confidence — não achatar pra bool). `prospect-classify` lê os campos nativos; se ausentes, devolve `probability=null`/`confidence=null` (**nunca** derivar de `urgency`). **V4** só gradeia faixa (auto_dm≥`threshold_auto`/review≥`threshold_review`/alert/discard) quando `probability` existir.
- **`ai-decide data.answers` (canônico, pós-H3b do Hub):** mapa por NOME da questão; cada resposta = `{ type:'noul'|'choice'|'score', value, confidence:number 0..1 }`. **noul**: `value`=probabilidade 0..1 (não bool). **choice**: `value`=chave escolhida (string) + opcional `probabilities:Record<string,number>`. **score**: `value`=inteiro no range. V4 lê `answers.is_opportunity.value`/`.confidence`; **sem** campo duplicado no topo. Até o H3b, o `ai-decide` retorna shape primitivo → `prospect-classify` lê **defensivo** (objeto→nativo; primitivo→`probability/confidence=null`).
- **HMAC WAHA:** header `X-Webhook-Hmac` (hex) + `X-Webhook-Hmac-Algorithm: sha512`; HMAC-SHA512 do corpo cru; compare em tempo constante.
- **person_key:** `lead_id::text` se virou lead; senão `hex(sha256(normalizePhoneBR(phone)))`.
- **author_key (engine-independente):** telefone resolvido normalizado, senão o identificador sem sufixo `@c.us|@lid|@s.whatsapp.net`.
- **prospect-create-lead-deal (narrow):** só lead(upsert por `company_id,phone`)+deal(origem/tags/instance). **Nunca** insere em `messages` nem dispara SDR/SLA/fila.

## Critérios de aceite
1. H1 no staging; `gen types` regenerado; tabelas com RLS por `company_id`.
2. Flag oculta (fora de `AVAILABLE_FEATURES`), ligada só na Veltz; UI some sem a flag.
3. `ai-decide` responde **sem** `TYPESAFE_API_KEY` via Haiku e grava `ai_usage.provider='anthropic'`; com secret+config `jev`, usa Jev sem redeploy; custo Jev = input×0,042/MTok.
4. `prospect-group-inbound` recusa HMAC inválido (401); `verify_jwt=false`.
5. Grupo → `raw` (dedup por engine; telefone resolvido quando possível; métrica de resolução **por engine**); 1:1 → inbox; **SAIR/PARE** → `marketing_opt_out` + bloqueio.
6. **Nenhuma mensagem de grupo aparece como 1:1 no inbox** (teste explícito).
7. Caminho de volta: resposta do lead no inbox; vendedor responde e sai pela **sessão dedicada** (`whatsapp-send→waha-hub→Hub`).
8. Guardrails: `shadow_mode` bloqueia todo envio; `dm_auto_enabled` bloqueia só o automático; aprovação manual exige admin/super_admin (JWT) e passa pelos demais guardrails; kill switch empresa+global; rampa 3→15; intervalo/jitter; 1 contato/pessoa; opt-out antes do envio.
9. Modo alerta (<70% resolução): `decision='alert'`, **tarefa criada** para o Toni, sem DM; "Abordei" cria lead+deal pela função estreita.
10. **Teste de RLS:** vendedor (seller) **não** altera `prospect_config`, `prospect_criteria`, nem `decision`/`status` de `prospect_signals` (trigger barra); consegue só `human_label` via RPC.
11. Cron: `pg_cron`/`pg_net` on; jobs via função que lê `prospect_cron_config` e faz **RETURN** com URL vazia; prod vazio até OK; purga 7d + anonimização de sinais sem lead.
12. Nada toca `waha-inbound`/`waha-webhook-receiver`/`whatsapp-send`/`process-message-queue`; DM automática off por padrão.

## Decisões tomadas
- **companies = `public.companies`**; funções `veltzy.*`; leads/deals/tasks em `veltzy`. FKs/policies alinhadas ao real.
- **Função estreita `prospect-create-lead-deal`** em vez de `skipSideEffects` (que insere a mensagem e pula o deal — inverso do que precisamos). Handler compartilhado intocado.
- **1:1 sem SDR** garantido pela pipeline de Prospecção sem SDR (não altera o handler); aceite 2/6 cobre.
- **ai-decide separado do ai-complete**; fallback Haiku é o default quando falta o secret (nunca ponto único de falha).
- **Cron sem `app.*`/URL fixa:** tabela `prospect_cron_config` + funções SECURITY DEFINER com guard de URL vazia; staging populado fora de migration, prod vazio até OK.
- **RLS:** config/criteria = select empresa + write super_admin; signals = update de coluna restrita via trigger + RPC `prospect_review_signal`; raw/dm_log/contacted = escrita só service_role.
- **Duas engines:** `raw` grava `session_name`/`engine`; dedup lógico por `(group_jid, message_external_id, author_key)`; resolução medida **por engine**.
- **Purga:** anonimiza `author_*` de sinais >7d sem lead; `snippet` permanece.
- **person_key** = `lead_id` ou `sha256(telefone)`; **kill switch global** em `system_flags`.
- Probabilidade do fallback Haiku é aproximada (tool-calling), não calibrada como a do Jev — registrada com `provider`.
- **Resolução de telefone v1 = por-payload só.** O fallback por-API (`participants/v2`+LIDs) depende de uma **edge nova no Hub** (`waha-group-participants`) porque Veltzy não acessa a WAHA direto — fica DEFERIDO como necessidade do Hub. Impacta a taxa de resolução medida no sombra (risco @lid): com só payload, LID puro cai em modo alerta. Quando o Hub expor o endpoint, `prospect-phone-resolve` ganha o fallback sem mudar o resto.
- **engine do raw** derivada do `session_name` (convenção do H4), não de coluna em `waha_instances` (que não existe) nem de `prospect_config.engine` (que é single-value e não distingue as 2 sessões-sombra do mesmo número).
- **Texto da DM**: `prospect-dm-send` é agnóstico (recebe `message_text`), mas **valida opt-out obrigatório** (SAIR/PARE) no gate. Composição = Haiku via `ai-complete` (feature `prospect_dm_message`) em `_shared/prospect-compose-dm.ts`, reusada pelo V4 (auto) e pela UI (rascunho). Desacopla composição de envio sem perder a garantia de opt-out.
- **1-contato-por-pessoa = reserva ATÔMICA antes do envio, chave estável `hex(sha256(normalizePhoneBR(phone)))`** (supera o person_key dual lead_id/phone): o `dm-send`, depois de passar todos os outros guardrails, faz `INSERT prospect_contacted {person_key, responded:false}` on-conflict-do-nothing; conflito → `already_contacted`; **falha de envio → remove a reserva** (permite retry). V2 (responded-update) e o prefilter usam a MESMA chave. Elimina DM dupla sob concorrência e o mismatch de chave. O vínculo com o lead fica em `signal.lead_id`.
- **tags `grupo:<nome>` vão em `leads.tags`** (a tabela `deals` não tem coluna `tags` — confirmado no schema).
- **Rampa de aquecimento real** precisa de `prospect_config.warmup_started_at` (necessidade registrada ao Hub). Até existir, o teto do dia usa `daily_dm_cap` + contagem de 24h como proxy.
- **Feature key canônica = `prospect_classify`** (snake). `prospect-classify` chama `ai-decide` com `feature='prospect_classify'`. Sem linha em `ai_features`/`ai_model_config`, o resolver cai no **fallback Haiku** (correto por ora). Para **ligar o Jev** (pós-H3b + `TYPESAFE_API_KEY`), o Hub semeia `('veltzy','prospect_classify', provider='jev', model=<jev>)`.
- **Smoke sem credencial privilegiada:** `prospect-classify`/`ai-decide` são `verify_jwt=false` e a chamada interna usa o service env do runtime → o smoke externo roda com a **anon key pública** do staging (não usar service_role de peer; política do Toni). Se o gateway exigir service, o smoke é gate humano do Toni.
- **Enforcement de teto de IA (A3b do Hub, futuro):** `ai-decide` chama `check_ai_access` e loga `ai_usage` → sujeito ao teto mensal (`tenant_ai_config`/`current_month_spend_usd`). Alinhar o contrato com o copiloto do Hub quando o A3b entrar.

## Pendências do Toni (fora do código)
- `TYPESAFE_API_KEY` no staging quando o early access sair (`supabase secrets set`, nunca no chat).
- Assinar o **DPA da TypeSafe** antes da flag em produção.
- Parear o **QR** do número novo; aquecer o número antes de entrar nos grupos.
- Montar o **grupo de teste** (só pessoas cientes) para dev/E2E no staging.
