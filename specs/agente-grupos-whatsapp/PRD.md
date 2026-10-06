# PRD: Agente de prospecção em grupos de WhatsApp

Trilha: G
Início: 2026-10-05 19:20

> Feature oculta, por-empresa. v1 só a Veltz (controladora dos dados). Investigação read-only concluída; nenhuma linha de código, migration ou deploy nesta etapa. Esta PRD define o contrato; a SPEC só começa após OK do Toni.

---

## Problema e objetivo

Em grupos de WhatsApp circulam pedidos de indicação ("alguém conhece uma boa consultoria de X?"). Hoje isso se perde. Objetivo: um agente que **entra no grupo, só escuta**, identifica com alta confiança uma oportunidade, manda **uma** DM ao autor (identificando a Veltz, citando o pedido, com opt-out), e cria contato + deal numa pipeline de prospecção dedicada. A resposta cai no inbox e um humano assume. Nunca escreve no grupo. Sem follow-up automático na v1.

Metas v1:
- Zero escrita em grupo; zero importação de lista de participantes.
- DM automática só liga após validação em **modo sombra** (classifica e registra, não envia).
- Guardrails de envio obrigatórios (teto diário, rampa, horário, intervalo, 1 contato por pessoa).
- Não tocar nem depender de redeploy das edges compartilhadas de produção.

---

## Estado atual (codebase e schema) — o que a investigação revelou

### Veltzy
- **`waha-inbound`** não tem nenhum tratamento de grupo: o payload (`WahaInboundPayload`, `waha-inbound/index.ts:14-33`) nem carrega `@g.us`/`participant`. A defesa é indireta — descarta telefone inválido após `normalizePhoneBR` (`waha-inbound/index.ts:88-95`). O filtro real de grupo vive no **Hub `waha-webhook-receiver`** (skip `isGroup`/`@g.us`, `waha-webhook-receiver/index.ts:124-140`). → Mensagens de grupo **não chegam** ao Veltzy hoje.
- **Envio WAHA** não é direto: `whatsapp-send` → `providers/waha-hub.ts` → `callHub('waha-send-message')` no Hub. base_url e API key **só existem no Hub** (`waha-hub.ts:12,21-23,45-66`). Para a DM sair por edge nova chamando a WAHA direto, essa edge precisa de base_url + API key (ver §Decisões).
- **Associação resposta↔lead**: chave `UNIQUE(company_id, phone)` em `veltzy.leads`; lookup por telefone normalizado em `lead-inbound-handler.ts:112-117`; mensagem gravada em `veltzy.messages` com `lead_id` + `instance_name` (`lead-inbound-handler.ts:236-252`). Se a sessão dedicada entregar a resposta da DM por um inbound que normalize o mesmo telefone, cai na conversa certa.
- **Normalização**: `normalizePhoneBR` (`_shared/phone.ts:4-14`) → `55`+DDD+número, 12-13 dígitos ou vazio.
- **Flag por-empresa**: `companies.features` jsonb; lida no front via `useAuthStore(s => s.company?.features?.<flag>)` (`contacts-bulk-action-bar.tsx:67`, `app-sidebar.tsx:94`) e na edge via `(company.features)?.<flag>` (`sdr-ai/index.ts:244-253`). Padrão pronto para flag oculta.
- **IA via Hub**: `HubClient.complete()` → `POST /functions/v1/ai-complete` com `{company_id, product:'veltzy', feature, messages[], tools?, max_tokens, temperature}` (`_shared/hub-client.ts:28-42,117-123`). Modelo resolvido por `ai_model_config` (product+feature) em `sdr-ai/index.ts:137-150`.
- **Pipeline/deal/origem**: `pipelines`+`pipeline_stages` (`database.ts:284-318`), `createPipeline()` cria 6 stages padrão (`pipelines.service.ts:59-88`); `deals` tem `source_id`, `origin_instance_name`, `origin_*`, `routing_rule_id` (`database.ts:435-460`). **Criação programática** limpa: `handleInboundMessage()` (`_shared/lead-inbound-handler.ts:80-437`) cria lead+deal resolvendo pipeline por origem; aceita `pipelineId`, `sourceId`, `tags`, `useQueue`. É o caminho da edge nova (reaproveita, não reescreve).

### Hub
- **`ai-complete`** despacha **só openai e anthropic** (`ai-complete/index.ts:207-213`); gemini/deepseek/kimi existem no catálogo mas sem handler. Resolução por precedência: override da empresa → `ai_features` (default) → global legado → fallback `openai/gpt-4o-mini` (`resolver.ts:32,40-62`). **Contrato é de chat** (`messages[]` role/content).
- **Custo/quota já existem e são reaproveitáveis**: `tenant_ai_config` (limite $/mês por empresa), `check_ai_access()` (kill switch global `system_flags.ai_globally_enabled` + por empresa + limite), `increment_ai_spend()`, log em `ai_usage`, alerta 80% (`baseline.sql:632-691,1108-1123,2892-2907,3197-3205`).
- **`ai_model_config`** existe (Fatia 4: company_id, provider_id FK `ai_providers`, índices únicos global/empresa, RLS super_admin). **`ai_features` ainda NÃO foi criada** (planejada F1; lida de forma otimista, resolver trata null). `kind` previsto: completion|embedding|transcription|web_search (extensível).
- **Flag**: `companies.features` jsonb; `updateCompanyFeatures()` (`hub/src/services/companies.service.ts:109-118`), UI em `feature-flags-tab.tsx`. Flag oculta = não listar em `AVAILABLE_FEATURES` e ligar via service/SQL só na Veltz.
- **WAHA infra**: versão **2026.8.1**, engine seed **WEBJS** com **fallback hard NOWEB** no provisionamento (`waha-instance-manage/index.ts:85-89`). base_url em `waha_config` (singleton, RLS super_admin), API key = secret `WAHA_API_KEY_GLOBAL` (header `X-Api-Key`, `_shared/waha-proxy.ts:44`). Sessões em `waha_instances` (`session_name` UNIQUE, roteamento por `product`). `waha-webhook-receiver` resolve telefone de LID via `_data.key.remoteJidAlt` quando `addressingMode==='lid'` (`waha-webhook-receiver/index.ts:48-56`) — **mas só no caminho de DM; grupos são descartados**.

### Jev (TypeSafe AI) — https://docs.typesafe.ai/
- **Decisão tipada, não chat.** Endpoint único `POST https://api.typesafe.ai/v1/systemone`, auth `Authorization: Bearer <API_KEY>`. Uma chamada carrega um **map de questions** (combina `choice`+`score`+`noul` numa só) sobre um `state` (string ou objeto/array estruturado). Resposta: por questão, `choice/score/noul` + `confidence` (0-1) + `probabilities`.
- Limites conhecidos: Choice até **255 opções**, Score **2-10** níveis. **Não documentados**: tamanho máximo de input, rate limit (existe 429), batch de múltiplos states. Erros 401/422/429/529.
- **Contexto (mensagens vizinhas)**: cabe dentro do `state` como objeto/array estruturado (não há campo de contexto separado). "Lote por janela por grupo" = empacotar a janela de mensagens no `state` e perguntar por mensagem-alvo, **não** há batch nativo de N states.
- **Preço/região (públicos)**: input **US$ 0,042/MTok**, **output gratuito**; serviço hospedado na **Costa Oeste dos EUA** ([blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)). Compromisso público de **não treinar com dados do cliente**; oferece **DPA** (typesafe.ai/legal/data-processing). **Early access** (lab novo) → não pode ser ponto único de falha.

> **Fontes externas:** [docs.typesafe.ai](https://docs.typesafe.ai/) · [api.md](https://docs.typesafe.ai/api.md) · [legal.md](https://docs.typesafe.ai/legal.md) · [WAHA Groups](https://waha.devlike.pro/docs/how-to/groups/) · [WAHA NOWEB](https://waha.devlike.pro/docs/engines/noweb/) · issues @lid: [#2267](https://github.com/devlikeapro/waha/issues/2267) · [#2010](https://github.com/devlikeapro/waha/issues/2010) · [#1608](https://github.com/devlikeapro/waha/issues/1608) · [#1073](https://github.com/devlikeapro/waha/issues/1073)

---

## ⚠️ Achado decisivo — identidade do autor em grupo (@lid) é risco de viabilidade

O ponto crítico do brief tem resposta preocupante. Em grupos, o autor pode vir como **`@lid`** (ID oculto) em vez de telefone. Na nossa versão (**WAHA 2026.8.1, NOWEB**) há regressões **abertas** exatamente nessa faixa:
- **#2267 (2026.8.2):** primeira mensagem de contato `@lid` (click-to-WhatsApp) **não é emitida** e some da API.
- **#2010 (2026.3+):** alguns webhooks deixaram de trazer `remoteJidAlt` → quebra a resolução LID→telefone.
- **#1608 / #1073:** `payload.from = @lid` e **DM para `@lid` falha** (não é JID válido).

Consequência: **nem sempre dá para resolver o telefone do autor, nem garantir que a DM chegue.** Isso ataca a premissa central ("mandar DM ao autor").

**Mitigação que entra na PRD (não resolve, gerencia):**
1. O **modo sombra mede também a taxa de resolução de telefone** (% de mensagens de grupo cujo autor tem telefone BR válido e DM-able recuperável), não só o limiar do classificador. **O piso de ≥ 70% decide apenas a DM automática.** Abaixo de 70%, a feature **não desliga**: opera em **modo alerta** — o sinal (grupo + trecho) é **notificado ao Toni** para **abordagem manual**, sem DM automática.
2. A edge nova de inbound tenta resolver na ordem: `participant`/`author` → `_data.key.participantAlt`/`remoteJidAlt` → cruzamento com `GET /api/{session}/groups/{id}/participants/v2` → tabela Contacts-LIDs da WAHA. Se nada resolver um telefone DM-able, **não contata** (vira descarte, registrado).
3. **Engine é decisão de infra a validar**: testar **WEBJS vs NOWEB** na sessão dedicada em sombra; WEBJS tende a expor `@c.us` nos participantes, mas é mais pesado/instável para escuta 24/7 (e tem bug próprio de join, #2266). Recomendo começar o sombra em **ambas** e escolher pela taxa de resolução medida.

---

## Requisitos funcionais

### Pré-filtro determinístico (antes de qualquer IA)
Descarta: mídia sem texto; mensagem curta (< limiar, proposta 15 chars); do próprio número; autor já contatado (ledger); lead existente com `marketing_opt_out=true`; autor sem telefone DM-able resolvido. O que sobra vai para classificação.

### Classificação (Jev, atrás de interface com fallback)
- Em **lote por janela por grupo**: a edge agrupa mensagens numa janela, monta o `state` com a mensagem-alvo + **vizinhas como contexto**, e pergunta um map de questions: `is_opportunity` (noul), `categoria` (choice), `urgencia` (score). Retorna probabilidade calibrada + confidence.
- **Interface `DecisionClient` com fallback**: primário = **Jev**; fallback = **Haiku** via tool-calling (JSON estruturado equivalente). Trocável por **config** (linha em `ai_model_config`/`ai_features`), **sem refatoração**. Jev é early access → fallback obrigatório, nunca ponto único de falha.
- Faixas: **≥ limiar_auto** → DM automática; **limiar_review ≤ x < limiar_auto** → fila de revisão humana; **< limiar_review** → descarta. Limiares calibrados no sombra.

### Geração da DM (Haiku via ai-complete do Hub)
A partir da mensagem original + categoria, Haiku gera o texto. Regras de conteúdo: identifica a Veltz, cita o contexto do pedido feito no grupo, oferece opt-out (SAIR/PARE). Sem dado pessoal no prompt além do texto público do pedido.

### Envio da DM (edge nova → `waha-send-message` do Hub) + guardrails
- **Envio pelo Hub**: `prospect-dm-send` chama o `waha-send-message` do Hub (já existe) com a **sessão dedicada** — **não** lê `WAHA_API_KEY_GLOBAL` nem base_url, **não** toca `whatsapp-send`/`process-message-queue`. Se o `waha-send-message` barrar a sessão por filtro de `product`, o ajuste é **bloco do Hub** (liberar a sessão dedicada).
- **Teto diário** com **rampa de aquecimento** do número novo: **3 DMs/dia na 1ª semana**, subindo até o **teto de 15/dia**.
- **Horário comercial** (tz America/Sao_Paulo) e **intervalo aleatório** entre envios (jitter).
- **Um contato por pessoa, para sempre**, salvo resposta dela (ledger `prospect_contacted`). Sem follow-up automático.
- Checagem de **opt-out antes de enviar** (reusa `leads.marketing_opt_out`).
- **Kill switch** por empresa (`prospect_config.is_enabled`) e **global** (`system_flags`, espelhando `ai_globally_enabled`).
- **DM automática só liga após aprovação do sombra** (ver critério).

### Criação de contato + deal
Edge chama `handleInboundMessage()` com `pipelineId` (pipeline de prospecção dedicada), `sourceId` (lead_source "grupo-whatsapp"), `tags` (ex.: `grupo:<nome>`), origem marcada. Resposta do lead cai no inbox pelo caminho de inbound da sessão dedicada → humano assume.

### Modo sombra
Classifica e **registra** (`prospect_signals.shadow=true`), **não envia**. Alimenta a tela de rotulagem rápida para calibrar limiar e medir resolução de telefone.

---

## Repos envolvidos e contrato entre eles (ordem forte)

**1. Hub (primeiro — dono do schema e da infra):**
   1. Flag `companies.features.prospect_groups_enabled` (default false, oculta) + ligar só na Veltz.
   2. Tabelas (schema `veltzy`, criadas pela codificadora do Hub) + RLS por `company_id`.
   3. **Provider Jev**: endpoint **novo `ai-decide`** (não encaixar no `ai-complete` — ver Decisões), com dispatch Jev (primário) + Haiku tool-call (fallback), reusando resolver + `check_ai_access`/`increment_ai_spend`/`ai_usage`; registro da feature em `ai_model_config`/`ai_features`. Secret `TYPESAFE_API_KEY`.
   4. **Sessão WAHA dedicada**: provisionar sessão nova (engine a validar), `webhook_url` → edge de inbound nova do Veltzy, **com eventos de grupo habilitados** (não passa pelo `waha-webhook-receiver`). Garantir que o **`waha-send-message` aceite a sessão dedicada** (filtro de `product`), para a DM e para a resposta do vendedor pelo inbox.

**2. Veltzy (depois — depende do contrato do Hub existir):**
   - Edges: `prospect-group-inbound` (recebe eventos da sessão dedicada, valida HMAC, pré-filtro, persiste raw), `prospect-classify` (chama Hub `ai-decide`), `prospect-dm-send` (chama `waha-send-message` do Hub com a sessão dedicada), reuso de `handleInboundMessage` para contato+deal.
   - Crons: processar janelas por grupo (respeitando cap/rampa/horário/intervalo); purgar raw (pg_cron).
   - UI: tela de grupos, fila de sinais, modo sombra/rotulagem, métricas.

**Bloqueadores de liberação (a Copiloto não libera bloco Veltzy dependente antes):**
- `prospect-classify` não libera antes de `ai-decide` + Jev configurado no Hub.
- `prospect-group-inbound` não libera antes da sessão dedicada provisionada apontando para ele.
- `prospect-dm-send` não libera antes do `waha-send-message` validado com a sessão dedicada.

---

## Modelo de dados (schema `veltzy`, criado pelo Hub; RLS por company_id)

> Padrão de policy: `company_id = get_current_company_id() OR is_super_admin()`. Edges usam service_role.

1. **`prospect_groups`** — grupos monitorados
   `id, company_id, session_name, group_jid (@g.us), name, invite_code, niche, is_active, joined_at, created_at`.
2. **`prospect_criteria`** — critérios por nicho
   `id, company_id, niche, questions (jsonb — o map Jev), threshold_auto numeric, threshold_review numeric, is_active, updated_at`.
3. **`prospect_signals`** — sinais com probabilidade
   `id, company_id, group_id FK, message_external_id, author_identifier (phone|lid), author_phone_resolved (nullable), snippet (só o trecho que gerou o sinal), is_opportunity bool, category, urgency, probability numeric, confidence numeric, decision (auto_dm|review|discard), status (pending|approved|rejected|sent|expired), shadow bool, human_label (nullable — rotulagem), reviewed_by, reviewed_at, lead_id (nullable), deal_id (nullable), created_at`.
4. **`prospect_dm_log`** — log de DMs
   `id, company_id, signal_id FK, session_name, to_phone, to_identifier, message_text, status (queued|sent|failed|blocked), waha_external_id, error, sent_at, created_at`.
5. **`prospect_contacted`** — ledger "um contato por pessoa, pra sempre"
   `id, company_id, person_key (lead_id quando virou lead; senão **hash SHA-256 do telefone** para quem não virou lead), first_contacted_at, responded bool, UNIQUE(company_id, person_key)`.
6. **`prospect_config`** — limites, limiares e kill switch por empresa
   `company_id PK, is_enabled bool (kill switch), shadow_mode bool, daily_dm_cap int, warmup jsonb (rampa), business_hours jsonb (start/end/tz), min_interval_seconds int, max_interval_seconds int, engine (webjs|noweb), updated_at`.
7. **`prospect_group_messages_raw`** — janela bruta, retenção curta
   `id, company_id, group_jid, message_external_id, author_identifier, text, window_context jsonb, received_at` + **pg_cron purge ≥ N dias (proposta 7)**.

Kill switch **global** reusa `system_flags` do Hub (novo flag `prospect_globally_enabled`, espelhando `ai_globally_enabled`).

---

## LGPD (obrigatório — dado pessoal novo)

**Base legal: legítimo interesse** (art. 7º, IX e art. 10, LGPD) para prospecção B2B a partir de manifestação **pública e explícita** de necessidade em grupo.

**LIA (resumida):**
- *Finalidade legítima*: conectar quem pediu publicamente uma indicação ao serviço de consultoria da Veltz. Concreta e específica.
- *Necessidade*: só mensagens que manifestam necessidade explícita e com alta confiança do classificador; não se trata todo o grupo. Minimização por desenho.
- *Balanceamento / expectativa do titular*: quem posta um pedido público de indicação espera ser contatado a respeito — o contato direto é previsível e proporcional. Salvaguardas que pesam a favor: **um único contato**, identificação clara da Veltz, citação do contexto, **opt-out imediato (SAIR/PARE)**, **sem follow-up**, **sem importar lista de participantes**, **retenção curta**, e **não envio de PII ao classificador**.

| Dado | Finalidade | Base legal | Retenção | Exclusão |
|---|---|---|---|---|
| Texto do pedido (público) + vizinhas (contexto) | Classificar oportunidade | Legítimo interesse | Raw: **7 dias** (pg_cron). Só o trecho-sinal (`snippet`) persiste | Purga automática; hard delete a pedido |
| Identificador do autor (telefone/lid) | Enviar 1 DM e deduplicar contato | Legítimo interesse | Enquanto durar a relação / prazo legal | Opt-out → nunca recontatar; hard delete a pedido |
| Contato/deal gerado | CRM (relação comercial) | Execução/legítimo interesse | Regras já vigentes do Veltzy | Fluxo de exclusão existente do Veltzy |

- **Minimização forte**: o payload enviado ao **Jev** e ao **Haiku** contém **apenas o texto da mensagem (+ vizinhas)**, **sem** telefone/nome/identificador. A resolução de telefone é local, fora da IA.
- **Opt-out**: toda DM traz SAIR/PARE; lista de opt-out (`leads.marketing_opt_out`) checada **antes** de qualquer envio. Resposta "SAIR/PARE" → `marketing_opt_out=true` + bloqueio permanente.
- **Suboperadores / transferência internacional (art. 33)**: **TypeSafe AI (Jev)** — hospedado na **Costa Oeste dos EUA** (público) — e **Anthropic (Haiku, via Hub)** — também EUA. Transferência amparada por **DPA/cláusulas contratuais**; TypeSafe oferece DPA e **compromisso de não treinar com dados**; Anthropic já é suboperador do ecossistema via Hub. **DPA da TypeSafe a ser assinado pelo Toni** antes da flag em produção. Registrar ambos no inventário de suboperadores.
- **Não** se importa nem persiste a lista de participantes do grupo. Mensagens de terceiros não relacionadas a um sinal são purgadas na janela de 7 dias.

---

## UI (Veltzy, oculta atrás da flag)

1. **Tela de Grupos** (`/prospeccao` ou aba): lista de grupos monitorados (nome, status da sessão, nicho); entrar via **invite link**; ativar/desativar por grupo; **kill switch por empresa** visível; indicadores por grupo (msgs lidas, sinais, DMs, respostas).
2. **Fila de sinais**: cards da **faixa intermediária** (review) com snippet + categoria + urgência + probabilidade → **Aprovar** (envia DM) / **Rejeitar**. Abas auxiliares: auto-enviados (read-only) e descartados (auditoria).
3. **Modo sombra / rotulagem rápida**: lista de mensagens classificadas em sombra (sem envio) com botão **é oportunidade / não é**; mostra probabilidade do Jev vs rótulo humano para calibrar o limiar e **a taxa de resolução de telefone**.
4. **Métricas básicas**: mensagens lidas, sinais por faixa, DMs enviadas, respostas recebidas, taxa de resposta — por grupo e agregado.

---

## Validação por modo sombra (proposta — Toni decide)

- **Tamanho/duração**: **≥ 50 positivos revisados** por humano **ou 4 semanas** de escuta — o que vier **primeiro**; + **amostra de 200 negativos rotulados** para medir **recall**.
- **Critério para ligar a DM automática** (todos):
  1. **Precisão no limiar_auto ≥ 0,90** (≤ 10% de falso-"oportunidade").
  2. **Taxa de resolução de telefone DM-able ≥ 70%**.
  3. **OK explícito do Toni.**
- **Abaixo de 70%** de resolução: **modo alerta** (manual), a feature não desliga. Enquanto a DM automática não for aprovada: `shadow_mode=true`, DM desligada.

---

## Estimativa de custo de IA por grupo ativo (volume realista)

Premissa corrigida: **pedido explícito de indicação é raro** — **poucas oportunidades por semana** por grupo (estimativa 1-3/semana). O custo é dominado pela **classificação** (roda em todas as mensagens filtradas), não pelas DMs.

Premissas de volume: ~500 msgs/grupo/dia; pré-filtro remove ~60% → ~200 classificáveis/dia; agrupadas em janelas com vizinhas → ~20-25k tokens de input/dia/grupo ao Jev.

| Item | Volume | Preço | Custo |
|---|---|---|---|
| Jev (classificação) | ~20-25k tokens input/dia/grupo | **US$ 0,042/MTok input, output gratuito** | **~US$ 0,001/dia/grupo** |
| Haiku (geração DM) | ~1-3 DMs/**semana**/grupo (~650 tokens cada) | Haiku 4.5 (tabela `MODEL_PRICES`) | **< US$ 0,01/semana/grupo** |

> Total de IA por grupo ativo ≈ **US$ 0,03-0,05/mês** (dominado pela classificação; a DM é ruído, por ser rara). Custo real medido em `ai_usage`, teto em `tenant_ai_config.monthly_limit_usd`.

---

## O que não entra (v1)
- Escrever no grupo (nunca). Follow-up automático. Importar lista de participantes. Mais de uma empresa (só a Veltz). Múltiplos idiomas. Resposta automática da IA no inbox (humano assume). Descoberta automática de grupos (entrada é por invite link manual).

---

## Riscos
1. **@lid / resolução de telefone** (viabilidade) — mitigado por sombra medindo a taxa + piso de 70% + escolha de engine. Pode **bloquear** a feature se a taxa for baixa.
2. **Jev early access** — instabilidade/limites/preço desconhecidos; mitigado pela interface com **fallback Haiku** obrigatório.
3. **Ban do número WAHA** — mitigado por rampa de aquecimento, teto, horário, jitter, 1 contato por pessoa, só escuta no grupo.
4. **Região do Jev não confirmada** — risco LGPD de transferência; resolver via DPA antes de produção.
5. **Edges compartilhadas** — não tocar `waha-inbound`/`whatsapp-send`/`process-message-queue`; sessão e envio dedicados isolam o risco.
6. **Reputação/consentimento** — contato não solicitado; mitigado por legítimo interesse + opt-out + identificação + contexto, e pela precisão exigida no sombra.

---

## Decisões tomadas
- **Jev entra por adapter próprio no Hub (novo endpoint `ai-decide`), não no `ai-complete`.** Motivo: o `ai-complete` tem contrato de **chat** (`messages[]`) e só despacha openai/anthropic; o Jev é `state`+`questions`→tipado. Encaixar à força poluiria o gateway e o fallback Haiku precisa **emular** o System One (tool-call com schema). O `ai-decide` reaproveita resolver + quota (`tenant_ai_config`/`check_ai_access`/`increment_ai_spend`/`ai_usage`), cumprindo "custo e quota controlados pelo Hub, incluindo o Jev".
- **Interface `DecisionClient` com fallback** (Jev→Haiku) trocável por linha de config, sem refatoração — atende o requisito de não ser ponto único de falha.
- **Tabelas no schema `veltzy`** (domínio Veltzy), mas criadas/aplicadas pela **codificadora do Hub** (Hub é dono das migrations do Central). Jev/`ai-decide` no schema/public do Hub.
- **DM sai por edge Veltzy nova (`prospect-dm-send`) chamando o `waha-send-message` do Hub** com a sessão dedicada — **não** lê `WAHA_API_KEY_GLOBAL`/base_url e **não** toca `whatsapp-send`/`process-message-queue`. Se o `waha-send-message` barrar a sessão por filtro de `product`, liberar a sessão é **bloco do Hub**.
- **Sessão WAHA dedicada** com webhook apontando para a edge de inbound nova (não `waha-webhook-receiver`), com eventos de grupo habilitados.
- **Minimização**: nenhum PII (telefone/nome) vai ao Jev/Haiku — só o texto público.
- **Engine (WEBJS vs NOWEB)**: no sombra os dois rodam como **dois dispositivos vinculados do mesmo número**; a escolha é pela **taxa de resolução de telefone medida** (campo `prospect_config.engine`).
- **Sessão dedicada**: a **codificadora do Hub provisiona** (eventos de grupo + webhook → edge do Veltzy); o **Toni pareia o QR** no celular do número novo.
- **Ambientes**: dev e E2E no **staging** (grupo de teste do Toni, só gente ciente). **Sombra com grupos reais roda em produção**, atrás da flag, **DM desligada**.
- **Propostas quantitativas** (sombra ≥1.000/precisão ≥0,90/resolução ≥70%, raw 7 dias, rampa) são sugestões para o Toni bater o martelo.

---

## Pendências para o Toni (antes da SPEC)
1. Aprovar a base legal (legítimo interesse) e os números do sombra/retenção/rampa.
2. OK à estratégia de IA (adapter `ai-decide` no Hub) e ao envio WAHA direto lendo o secret compartilhado.
3. Assinar o **DPA da TypeSafe** antes da flag em produção (região já confirmada: Costa Oeste/EUA).
4. Empresa-piloto = Veltz; número WAHA novo dedicado (quem provisiona a sessão no Hub).
