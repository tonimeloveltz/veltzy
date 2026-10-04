# SPEC: Campanhas + Automações — fidelidade Leadbaze

Trilha: M
Início: 2026-10-04 16:30
Merge: (preencher no merge)

## Contexto

O mkt-ativo do Veltzy já tem o motor completo (blast_campaigns/blast_recipients/blast-dispatch,
cadences/process-cadences, anti-ban server-side em `_shared/blast-schedule.ts`, audiência em
`_shared/blast-audience.ts`, HSM Cloud API, WAHA/Evolution). O que muda aqui é **UX + alguns
contratos**, pra ficar fiel às telas do Leadbaze (prints aprovados pelo Toni). NÃO se reescreve
o motor; reusa tudo.

Estado atual (confirmado por leitura):
- **Campanhas** (`src/pages/campanhas.tsx` + `src/components/campanhas/campaign-wizard.tsx`): wizard
  de 3 passos que **começa por Nome+Template (template OBRIGATÓRIO)**; audiência no passo 2
  (temperatura/etapa/tags/origem); passo 3 variáveis + agendamento + revisão + enviar. Anti-ban
  roda no servidor, **fixo e invisível**.
- **Cadências** (`src/pages/cadencias.tsx` + `src/components/cadencias/cadence-form.tsx`): lista +
  form (nome, gatilho manual/evento `lead_created`, condições, editor multi-step). Rota `/cadencias`,
  item de menu "Cadências".
- `blast_campaigns` exige `template_id` (NOT NULL? confirmar; hoje a UI força). `blast-dispatch`
  renderiza o BODY do template; WAHA/Evolution mandam como texto renderizado, Cloud API como HSM.
- `cadences.trigger_event`: hoje só `lead_created` (+ START manual).

## O que entra / o que não entra

**Entra (CAMPANHAS):**
1. **Mensagem livre** (texto cru, sem template) — padrão em **WAHA/Evolution**; template **opcional** lá.
2. **Cloud API continua exigindo template APPROVED** (regra da Meta; a UI explica).
3. **Wizard de 4 passos** começando pelo **Público**: Destinatários → Mensagem → Configurações → Revisão.
4. **Anti-ban visível e editável** por campanha (delay min/max, limite/hora, janela de horário).
5. **Estimativa de tempo** (contatos × delay médio).
6. **Filtros de público novos:** por etapa do funil, **seleção manual** de contatos, **excluir quem já
   recebeu mensagem nos últimos X dias**. (Tags/origem/temperatura já existem.)

**Entra (AUTOMAÇÕES = ex-Cadências):**
7. **Renomear Cadências → Automações** (menu, título, rota `/automacoes` com redirect de `/cadencias`).
8. **Form em 3 blocos** fiéis ao Leadbaze: **QUANDO ISSO ACONTECER** (gatilho + filtro por origem) ·
   **SOMENTE SE** (condições) · **ENTÃO FAZER** (passos). Botões **Salvar como rascunho** / **Salvar e ativar**.
9. **Texto livre no passo "Enviar mensagem"** (mesma regra das campanhas: livre em não-oficial, template no Cloud API).
10. **4 gatilhos novos:** Status/etapa alterado para… · Tag adicionada ao contato · Agendamento recorrente ·
    Webhook recebido. (Hoje só Novo contato + Manual.)

**Não entra:**
- Reescrever o motor de envio/fila/anti-ban (só expõe/parametriza o que já existe).
- Canal e-mail; captura de leads nova.
- Mudança nas métricas de entrega (Onda 2, já em prod).

## Decisões tomadas
- **Template só é obrigatório no Cloud API.** Em WAHA/Evolution, a aba "Escrever agora" (texto livre) é o
  padrão; "Usar template" é opcional. No Cloud API, a aba "Escrever agora" fica desabilitada com nota
  ("Canal oficial exige template aprovado pela Meta").
- **Rota:** nova `/automacoes`; manter `/cadencias` como **redirect** pra não quebrar links/sidebar antigos.
- **Anti-ban:** os defaults atuais do servidor viram os **valores pré-preenchidos editáveis** por campanha;
  override salvo na campanha; se o usuário não mexer, comportamento idêntico ao de hoje.
- **Excluir recentes:** checkbox default **desligado**, X default **7** dias.
- **Estimativa de tempo:** cálculo **client-side** (exibição), não persiste.
- **Nomes internos** (tabela `cadences`, edges `process-cadences`/`start-cadences`) **NÃO** mudam — só os
  rótulos de UI viram "Automações" (evita migration de rename + redeploy desnecessário).
- **Seleção manual:** guarda os `lead_id[]` escolhidos em `audience_filter.manual_ids`.
- **Teto do anti-ban = DIÁRIO (por número), não horário.** O motor (`blast-schedule.ts`) já enforça
  `daily_cap` (50/dia/número); o Leadbaze mostra "por hora" mas aqui o campo é **"Limite por dia (por número)"**
  (default 50), mapeado 1:1 no throttle do motor — **sem reescrever o motor** (opção a).
- **Seletor de público (Bloco B):** 5 modos exclusivos — Todos ativos / Por etapa / Por origem / Por tag /
  Seleção manual. **Temperatura saiu do seletor** da UI (segue suportada no `AudienceFilter`/contagem, só não
  exposta como modo). Mantém fiel aos modos do Leadbaze.
- **Variáveis do texto livre:** `{{nome}}`→name, `{{telefone}}`→phone, `{{empresa}}`→company_name.
  `{{origem}}` **não** entrou (exigiria join com lead_sources no render puro) — deferido.
- **Follow-up:** mantido como bloco opcional na etapa 3 (Configurações) para não regredir o recurso do wizard atual.
- **anti_ban coluna nova:** a edge lê `campaign.anti_ban ?? campaign.throttle_config` (precedência do override novo),
  defaults do servidor quando ambos null.
- **Automações (Bloco C):** gatilho "Manual" = `trigger_event=null`; os 5 eventos mapeiam o enum. `webhook_token`
  gerado client-side (`crypto.randomUUID`) ao escolher Webhook (unique index no banco). Condições guardadas em
  `trigger_conditions`: `to_stage_id`(in) p/ stage_changed, `tag`(eq) p/ tag_added, `source_id`(eq) do filtro de
  origem, `stage_id`(in) do "somente se". `/cadencias` → redirect `/automacoes`; nomes internos (tabela/edges) mantidos.
- **Bloco D — gatilhos (decisões do Toni via copiloto):**
  - `stage_changed`/`tag_added`: via FRONTEND best-effort — `deals.service` ao mover etapa + `leads.service` ao
    adicionar tag chamam `start-cadences` ({trigger,leadId,companyId}). Cobre ação do usuário; server-side fora deste corte.
  - `recurring`: presets em `recurring_cron` (`daily@HH:MM` / `weekly@<dow>@HH:MM` / `monthly@<dom>@HH:MM`), sem cron
    arbitrário. Edge `process-recurring-cadences` (cron-auth, a cada 15min) acha os "due" por `recurring_cron`+
    `recurring_last_run_at`, audiência = leads ativos que casam as condições do SOMENTE SE, cria `cadence_runs`
    idempotente, grava `recurring_last_run_at`. Migration 084 add `recurring_last_run_at`.
  - `webhook`: edge público `cadence-webhook` (verify_jwt=false, auth por `webhook_token`), payload `{phone, name?}`;
    resolve lead EXISTENTE por phone (normaliza BR) → cria run; lead inexistente = 200 ignorado (não cria lead).

## Arquivos
<!-- arquivos -->
supabase/migrations/083_campanhas_automacoes_leadbaze.sql
supabase/functions/_shared/blast-audience.ts
supabase/functions/_shared/blast-render.ts
supabase/functions/_shared/blast-schedule.ts
supabase/functions/blast-dispatch/index.ts
supabase/functions/process-cadences/index.ts
supabase/functions/start-cadences/index.ts
supabase/functions/_shared/cadence-engine.ts
supabase/migrations/084_cadences_recurring_last_run.sql
supabase/functions/process-recurring-cadences/index.ts
supabase/functions/cadence-webhook/index.ts
src/services/deals.service.ts
src/services/leads.service.ts
src/pages/campanhas.tsx
src/components/campanhas/campaign-wizard.tsx
src/services/campaigns.service.ts
src/hooks/use-campaigns.ts
src/components/mkt-ativo/stage-multi-select.tsx
src/components/campanhas/manual-contact-picker.tsx
src/components/campanhas/anti-ban-settings.tsx
src/pages/cadencias.tsx
src/components/cadencias/cadence-form.tsx
src/services/cadences.service.ts
src/App.tsx
src/components/layout/sidebar.tsx
<!-- /arquivos -->

## O que fazer em cada arquivo

### Migration
1. **`083_campanhas_automacoes_leadbaze.sql`** (novo)
   - `veltzy.blast_campaigns`:
     - `+ message_body text` (texto livre renderizável; usado quando `template_id IS NULL`).
     - `+ anti_ban jsonb` (override por campanha: `{delay_min_s, delay_max_s, hourly_cap, window_start, window_end}`; null = defaults do servidor).
     - `template_id`: tornar **NULLABLE** (hoje a UI força; passa a aceitar campanha de texto livre). Se já for nullable, no-op.
   - `veltzy.cadences`: `trigger_event` CHECK **+=** `'stage_changed'`, `'tag_added'`, `'recurring'`, `'webhook'`
     (dropar+recriar o CHECK, ver [[reference_sql_supabase_gotchas]]).
     - `+ recurring_cron text` (cron do gatilho "Agendamento recorrente", null fora dele).
     - `+ webhook_token text` (token do gatilho "Webhook recebido", null fora dele; único por automação).
   - `veltzy.cadence_steps.action_type`: já cobre send_message/send_template/wait/add_tag/remove_tag/change_stage/generate_ai — confirmar; o passo "Enviar mensagem" com texto livre usa `send_message` + `content` (já existe).
   - RLS: tabelas já têm policies por company; colunas novas herdam. Sem policy nova.

### Backend (edges / _shared) — reusar, não reescrever
2. **`_shared/blast-audience.ts`**: `buildAudiencePlan` passa a aceitar `manual_ids?: string[]` (usa exatamente esses) e `exclude_recent_days?: number` (exclui leads com mensagem enviada nos últimos N dias — join `messages`/`message_queue` por lead). `stage_id[]` já existe.
3. **`blast-dispatch/index.ts`**: se `campaign.template_id` for null, usar `campaign.message_body` como fonte (renderiza via blast-render); exigir template só quando provider = cloud_api (erro `template_required` se cloud_api sem template APPROVED). Ler `campaign.anti_ban` (se null, defaults). Aplicar `manual_ids`/`exclude_recent_days` via blast-audience.
4. **`_shared/blast-render.ts`**: renderizar `message_body` com variáveis `{{nome}}`/`{{telefone}}`/`{{origem}}` (mesma substituição do template body).
5. **`_shared/blast-schedule.ts`**: aceitar override (`anti_ban`) nos parâmetros (delay min/max, hourly_cap, janela); defaults = valores atuais.
6. **Gatilhos novos (`start-cadences` / `cadence-engine` / `process-cadences`):**
   - `stage_changed` / `tag_added`: disparados do ponto onde etapa/tag do lead mudam (ver onde o app atualiza `deals.stage_id` / `leads.tags`; chamar `start-cadences` aditivo, best-effort, como já é feito no inbound pra `lead_created`).
   - `recurring`: cron novo que, por `recurring_cron`, cria runs das automações recorrentes (reusa infra pg_cron).
   - `webhook`: endpoint que recebe POST com `webhook_token` → cria run da automação correspondente.
   - process-cadences/cadence-engine: sem mudança de lógica de execução (só passam a existir runs desses gatilhos).

### Frontend — Campanhas
7. **`campaign-wizard.tsx`** (reescrita do fluxo, mesmos componentes):
   - **4 passos:** 1 Destinatários · 2 Mensagem · 3 Configurações · 4 Revisão.
   - Passo 1: Nome + seletor de público (Todos ativos / Por etapa / Por origem / Por tag / **Seleção manual**) + checkbox **Excluir quem já recebeu nos últimos [X] dias** + card "N contatos serão impactados" (contagem ao vivo, reusa `useAudienceCount`).
   - Passo 2: abas **Escrever agora** (textarea + chips de variável + prévia) · **Usar template** (select atual). Default = Escrever agora (não-oficial). Cloud API: aba Escrever agora desabilitada com nota.
   - Passo 3: `<AntiBanSettings>` (editável) + Enviar agora/Agendar (datetime, já existe) + card **Estimativa de tempo**.
   - Passo 4: revisão + "Confirmar e Disparar".
   - `handleSend`: envia `message_body` (se texto livre) ou `template_id` (se template) + `anti_ban` + `audience_filter` (com manual_ids/exclude_recent/stage).
8. **`manual-contact-picker.tsx`** (novo): busca/seleção de contatos (multi-select) → devolve `lead_id[]`.
9. **`anti-ban-settings.tsx`** (novo): sliders/inputs de delay min/max, limite/hora, janela; value/onChange; defaults pré-preenchidos.
10. **`campanhas.tsx`**: "Nova campanha" abre o wizard novo (passo 1 = público); empty-state igual.
11. **`campaigns.service.ts` / `use-campaigns.ts`**: `CreateCampaignInput` += `message_body?`, `anti_ban?`, `audience_filter.manual_ids?`, `audience_filter.exclude_recent_days?`; `template_id` opcional.

### Frontend — Automações (ex-Cadências)
12. **`cadence-form.tsx`**: reorganizar em **3 blocos** (QUANDO ISSO ACONTECER: gatilho [6 opções: Novo contato · Status/etapa alterado para… · Tag adicionada · Agendamento recorrente · Webhook recebido · Manual] + filtro por origem; SOMENTE SE: condições; ENTÃO FAZER: passos). Botões **Salvar como rascunho** (is_enabled=false) / **Salvar e ativar** (is_enabled=true). Passo "Enviar mensagem" com texto livre (mesma regra Cloud API). Gatilhos recurring/webhook mostram os campos extras (cron / token gerado).
13. **`cadencias.tsx`**: título "Automações", "Nova automação", textos. (Arquivo pode manter o nome; só rótulos.)
14. **`cadences.service.ts`**: aceitar os novos `trigger_event` + `recurring_cron`/`webhook_token`.
15. **`App.tsx`**: rota `/automacoes` → página; `/cadencias` → `<Navigate to="/automacoes" />`.
16. **`sidebar.tsx`**: item "Cadências" → "Automações" (rota `/automacoes`, mesmo ícone ou ajustar).

## Contratos não óbvios

Mensagem livre vs template (campanha):
```ts
// message_body != null  -> texto livre (WAHA/Evolution). template_id = null.
// template_id != null   -> HSM/template. message_body = null.
// Cloud API SEM template_id APPROVED -> erro 'template_required' (regra Meta).
```

Audience estendida:
```ts
interface AudienceFilter {
  temperature?: string[]; stage_id?: string[]; tags?: string[]; source_id?: string;
  manual_ids?: string[];          // seleção manual: usa EXATAMENTE estes leads
  exclude_recent_days?: number;   // exclui lead com mensagem enviada nos últimos N dias
}
```

Anti-ban override:
```ts
interface AntiBan { delay_min_s: number; delay_max_s: number; daily_cap: number; window_start: string; window_end: string }
// null na campanha = defaults do servidor (blast-schedule atual: delay 30-90s, daily_cap 50/número, janela 08-20).
// Mapeia 1:1 no throttle_config do motor (NÃO reescreve o motor). Campo da UI = "Limite por dia (por número)".
```

Estimativa de tempo (client-side, exibição): `tempo ≈ N_contatos * média(delay_min,delay_max)`, respeitando `hourly_cap` e janela. Mostrar "~X min · conclui HH:MM".

## Critérios de aceite
- [ ] Wizard de campanha tem 4 passos na ordem Destinatários → Mensagem → Configurações → Revisão.
- [ ] Em empresa WAHA/Evolution dá pra criar campanha com **texto livre** (sem template) e disparar.
- [ ] Em empresa Cloud API, "Escrever agora" fica bloqueado com nota; template APPROVED segue exigido.
- [ ] Público: Todos ativos / etapa / origem / tag / **seleção manual** / **excluir recentes X dias** — contagem ao vivo reflete.
- [ ] Passo 3 mostra anti-ban **editável** + estimativa de tempo; override chega no disparo.
- [ ] Menu e página mostram **Automações**; `/cadencias` redireciona pra `/automacoes`.
- [ ] Form de automação em 3 blocos (QUANDO/SOMENTE SE/ENTÃO FAZER) + Salvar rascunho/ativar.
- [ ] Passo "Enviar mensagem" da automação aceita texto livre (não-oficial).
- [ ] Os 4 gatilhos novos existem e criam runs (status/etapa, tag, recorrente, webhook).
- [ ] `tsc -b` + `npm run build` verdes; prova no browser (staging) do fluxo campanha texto-livre + automação.
