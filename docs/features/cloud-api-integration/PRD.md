# PRD: Inbound WhatsApp via Meta Cloud API (`cloud-api-inbound`)

**Autor:** Toni Melo
**Data:** 2026-06-26
**Status:** Em revisao - aguardando validacao dos PVOs antes de Spec
**Escopo:** Edge Function de recebimento (`cloud-api-inbound`) + mudancas de modelo de dados que ela exige. Envio (outbound), refactor de `whatsapp-send` e UI multi-numero ficam fora deste PRD.

---

## 1. Contexto

### 1.1 Situacao atual

O Veltzy suporta dois providers de WhatsApp, selecionados por empresa via `companies.active_whatsapp_provider`:

- **Z-API** (legado): `zapi-webhook` recebe, `zapi-send` envia.
- **Evolution API** (via Hub): `evolution-inbound` recebe payload ja normalizado do Hub, `whatsapp-send` -> `evolution-send-message` envia.

Ambos os providers de recebimento delegam a logica de lead/deal/mensagem para `_shared/lead-inbound-handler.ts`. O `evolution-inbound` e a referencia de arquitetura: valida secret -> guard de provider -> normaliza -> `handleInboundMessage()`.

### 1.2 Problema

Z-API e Evolution operam sobre WhatsApp **nao-oficial** (multi-device / web). Numeros sofrem risco de banimento pela Meta. Para clientes que exigem estabilidade contratual, precisamos oferecer o **WhatsApp oficial** via **Meta Cloud API**, eliminando o risco de ban.

### 1.3 O que ja existe fora do codigo (Meta Developer Portal)

| Item | Status |
|------|--------|
| App "Veltzy" como Tech Provider independente | Criado |
| Business Verification (RM Desenvolvimento LTDA) | Aprovada |
| Login Configuration "Veltzy Embedded Signup" (`config_id`) | Criada |
| Dominio `app.veltzy.com` autorizado no SDK JS | Autorizado |
| System user `Veltzy_WhatsApp_SysUser` (`whatsapp_business_management` + `whatsapp_business_messaging`) | Criado |
| Token do system user (sem expiracao) | Gerado e guardado |
| App Review | Em andamento (faltam videos de demo) |

### 1.4 Diferencas estruturais vs. providers atuais

A Cloud API nao se encaixa no padrao plano dos providers atuais. Diferencas que este PRD precisa resolver:

1. **Webhook unico bidirecional** — o mesmo endpoint recebe **mensagens** (`value.messages[]`) e **status de entrega** (`value.statuses[]`). Os providers atuais so tratam inbound.
2. **Verificacao GET** — a Meta valida o endpoint com um `GET` contendo `hub.mode`, `hub.verify_token` e `hub.challenge`. Nenhum provider atual tem handler GET.
3. **Assinatura HMAC** — todo POST vem com `x-hub-signature-256: sha256=<hmac>` calculado sobre o body cru usando o **App Secret**. Substitui o shared-secret simples do `evolution-inbound`.
4. **Payload aninhado** — `entry[].changes[].value{ messaging_product, metadata, contacts[], messages[], statuses[] }`. Mapeamento totalmente diferente do payload plano.
5. **Resolucao de tenant** — Evolution recebe `company_id` no payload (o Hub resolve). A Cloud API **nao** manda `company_id`; o Veltzy precisa resolver a empresa a partir de `value.metadata.phone_number_id`. Greenfield: nao existe nenhum mapeamento hoje.
6. **Eventos de coexistencia** — `account_offboarded` e `account_reconnected` sinalizam quando o numero entra/sai do modo coexistencia (Cloud API + app WhatsApp no mesmo numero). Precisam ser tratados (mesmo que so logados nesta versao).

---

## 2. Decisoes de arquitetura

### D1. `cloud-api-inbound` espelha `evolution-inbound`
Mesma estrutura: um `Deno.serve` que autentica, faz guard de provider, normaliza e delega para `handleInboundMessage()`. Nenhuma logica de lead/deal/mensagem reimplementada — tudo via handler compartilhado.

### D2. Resolucao de tenant por `phone_number_id`
A empresa e resolvida via `value.metadata.phone_number_id`, nao via payload. Mapeamento persistido no Veltzy (ver secao 3). O `phone_number_id` da Meta vira o equivalente do `instance_name` do Evolution: identifica o numero/instancia que recebeu.

### D3. Reuso de `instance_name` para o numero Cloud API
Nao criar um conceito novo de "instancia". O `phone_number_id` (ou um label legivel derivado dele) e gravado em `leads.whatsapp_instance_name` e `messages.instance_name`, reaproveitando todo o roteamento multi-instancia ja existente (atribuicao por vendedor, filtro de inbox, SDR por pipeline).

### D4. Status de entrega tratado neste endpoint
Diferente do Evolution, a Cloud API entrega `statuses[]`. Este e o primeiro provider a popular `delivery_status` de verdade alem de `'sent'`. Mapear: `sent` -> sent, `delivered` -> delivered, `read` -> read, `failed` -> failed. Match da mensagem por `external_id = wamid` (ver D5 e PVO 2).

### D5. Verificacao de assinatura obrigatoria
HMAC-SHA256 sobre o **body cru** com o App Secret (`META_APP_SECRET`), comparado em tempo constante com `x-hub-signature-256`. Request sem assinatura valida -> `401`, sem processar. Substitui o `x-hub-secret` do Evolution.

### D6. Guard de provider = `'cloud_api'`
So processa empresas com `active_whatsapp_provider = 'cloud_api'`. Como a resolucao de empresa vem antes do guard (precisa do `phone_number_id` -> company), o guard roda depois de resolver o tenant. Qualquer outro provider -> resposta `200 { skipped: true }` (a Meta exige 200 para nao reenfileirar/retry).

### D7. Sempre responder 200 em evento processado ou ignorado
A Meta reenvia o webhook (com backoff por ate ~7 dias) se nao receber `2xx`. Erros de processamento de um item individual nunca devem derrubar a resposta — logamos e seguimos retornando 200, exceto falha de assinatura (401) e payload irreconhecivel (400).

---

## 3. Modelo de dados

### 3.1 Mapeamento `phone_number_id` -> empresa (NOVO)

Decisao em aberto (PVO 1). Recomendacao: **tabela dedicada**, porque uma empresa pode ter N numeros Cloud API (multi-instancia, igual Evolution) e precisamos guardar metadados da Meta (WABA id, display number, token).

```sql
-- migration 068_cloud_api_integration.sql
CREATE TABLE veltzy.cloud_api_numbers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number_id    TEXT NOT NULL UNIQUE,        -- value.metadata.phone_number_id (chave de roteamento)
  waba_id            TEXT,                          -- WhatsApp Business Account id
  display_number     TEXT,                          -- ex: +55 11 99999-0000 (humano)
  instance_label     TEXT,                          -- nome usado em leads.whatsapp_instance_name
  access_token       TEXT,                          -- token do numero (cifrado / Vault) para outbound futuro
  status             TEXT NOT NULL DEFAULT 'active' -- 'active' | 'offboarded'
    CHECK (status IN ('active', 'offboarded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_api_numbers_company ON veltzy.cloud_api_numbers (company_id);
-- phone_number_id ja unico -> lookup O(1) na resolucao de tenant
```

RLS: leitura por `company_id = get_current_company_id() OR is_super_admin()`. Escrita so super_admin / Edge Function (service role).

### 3.2 Extensao do CHECK de `active_whatsapp_provider`

Constraint atual (migration 046): `['zapi', 'wuzapi', 'revolution', 'meta', 'evolution']`. Nao inclui `'cloud_api'`.

```sql
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_active_whatsapp_provider_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_active_whatsapp_provider_check
  CHECK (active_whatsapp_provider = ANY (ARRAY['zapi','wuzapi','revolution','meta','evolution','cloud_api']));
```

> **Nota / PVO 4:** o constraint ja aceita `'meta'`. Podemos (a) reusar `'meta'` ou (b) adicionar `'cloud_api'`. Recomendo **`'cloud_api'`**: mais explicito e evita ambiguidade com "Meta" (que tambem cobre Instagram). Decisao trava o valor do guard em D6.

### 3.3 Extensao do CHECK de `delivery_status`

Constraint atual (migration 045): `('sent', 'failed', 'pending')`. Para refletir `delivered`/`read` da Cloud API:

```sql
ALTER TABLE veltzy.messages
  DROP CONSTRAINT IF EXISTS messages_delivery_status_check;
ALTER TABLE veltzy.messages
  ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('pending','sent','delivered','read','failed'));
```

Progressao monotonica: nunca regredir status (read nao volta para delivered). Logica de ordem aplicada no handler de status (ver 4.4). Ver PVO 3 (se queremos `delivered`/`read` ja nesta fase ou so `failed`).

### 3.4 Nada mais muda

Reusa `leads.whatsapp_instance_name`, `messages.instance_name`, `messages.external_id`, `messages.delivery_status` (ja existentes da feature Evolution). Nenhuma coluna nova em `messages`/`leads`.

---

## 4. Fluxos

### 4.0 Visao geral

```
Meta Cloud API
  -- GET  (verificacao) --> cloud-api-inbound -> responde hub.challenge
  -- POST (eventos)      --> cloud-api-inbound
       1. valida x-hub-signature-256 (HMAC body cru, META_APP_SECRET)
       2. para cada entry[].changes[].value:
            a. resolve company por value.metadata.phone_number_id
            b. guard: active_whatsapp_provider == 'cloud_api'
            c. dispatch por tipo: messages[] | statuses[] | account_* 
       3. responde 200 sempre (exceto 401 assinatura / 400 payload invalido)
```

### 4.1 Verificacao do endpoint (GET)

A Meta chama `GET /functions/v1/cloud-api-inbound?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=<N>`.

```
1. Le hub.mode, hub.verify_token, hub.challenge da query string
2. Se hub.mode == 'subscribe' && hub.verify_token == Deno.env.get('META_VERIFY_TOKEN'):
     -> responde 200 com o valor cru de hub.challenge (text/plain)
3. Senao -> 403
```

### 4.2 Validacao de assinatura (POST)

```
1. Le header x-hub-signature-256 (formato: "sha256=<hex>")
2. Calcula HMAC-SHA256(rawBody, META_APP_SECRET) -> hex
3. Compara em tempo constante. Diferente / ausente -> 401, nao processa.
```

> O body precisa ser lido **cru** (`await req.text()`) para o HMAC e so depois `JSON.parse`. Ler `req.json()` antes invalida o calculo do HMAC.

### 4.3 Evento de mensagem (`value.messages[]`)

Para cada mensagem, normalizar para os campos de `InboundParams` e chamar `handleInboundMessage()`:

| Campo Cloud API | Campo handler |
|-----------------|---------------|
| `messages[].from` | `phone` (via `normalizePhoneBR`) |
| `contacts[].profile.name` | `senderName` |
| `messages[].id` (wamid) | `externalId` |
| `messages[].type` | `messageType` (mapear `interactive`/`button`/`reaction` -> texto, igual evolution-inbound trata reaction) |
| `messages[].text.body` / caption | `content` |
| midia (`image`/`audio`/`video`/`document`) | `fileUrl` + `fileMimeType` + `fileName` |
| `value.metadata.phone_number_id` -> `instance_label` | `instanceName` |
| `messages[].referral` (CTWA) | `adContext` |

Detalhes de tipo:
- **Midia:** a Cloud API entrega `media_id`, nao URL. Baixar a midia exige 2 chamadas autenticadas (GET `/{media_id}` -> URL temporaria -> GET URL com Bearer token). Decisao em PVO 5: baixar e passar URL ao handler, ou passar `media_id` e resolver no handler. Recomendo resolver dentro do `cloud-api-inbound` (mantem o handler agnostico de provider) e passar uma URL ja baixavel.
- **`source`** = `'whatsapp'`.
- Reuso integral de dedup por `external_id`, criacao de lead/deal, avatar, SDR v1/v2 e automacoes — zero reimplementacao.

### 4.4 Evento de status (`value.statuses[]`)

Primeiro handler de status do projeto. Para cada `statuses[]`:

```
1. status.id = wamid da mensagem ENVIADA por nos
2. Busca message por (company_id, external_id == status.id)
3. Mapeia status.status: sent|delivered|read|failed -> delivery_status
4. Update so se avancar na ordem pending<sent<delivered<read (failed sobrepoe).
   Nunca regride.
5. status.errors[] (quando failed) -> logar code/title para diagnostico
```

Mensagens sem match (ex: enviadas antes de termos `external_id`, ou de outro provider) -> ignorar silenciosamente.

### 4.5 Eventos de coexistencia (`account_offboarded` / `account_reconnected`)

Chegam em `value` com o campo de evento correspondente.

- **`account_offboarded`**: o numero saiu do controle da Cloud API. Marcar `cloud_api_numbers.status = 'offboarded'`. Opcional (PVO 6): notificar admin. Sem isso, envios futuros falhariam silenciosamente.
- **`account_reconnected`**: voltou. Marcar `status = 'active'`.

Nesta versao: **atualizar status + log**. Notificacao ao admin fica como PVO 6.

---

## 5. Variaveis de ambiente (Edge Function secrets)

| Secret | Uso |
|--------|-----|
| `META_APP_SECRET` | HMAC da assinatura `x-hub-signature-256` |
| `META_VERIFY_TOKEN` | Verificacao do GET `hub.verify_token` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Acesso ao banco (ja existem) |
| (futuro outbound) token do system user | Fora de escopo deste PRD |

Webhook URL registrada na Meta: `https://zxefzegggntfjlfsdgvw.supabase.co/functions/v1/cloud-api-inbound`

---

## 6. Fases de implementacao

### Fase 1: Modelo de dados
1. Migration `068_cloud_api_integration.sql`: tabela `cloud_api_numbers` + RLS, extensao dos CHECKs de `active_whatsapp_provider` e `delivery_status`.
2. Atualizar tipos TypeScript (`database.ts`).
3. Seed manual de 1 numero de teste (`phone_number_id` -> empresa de teste).

### Fase 2: Endpoint inbound
1. Criar `cloud-api-inbound/index.ts` (GET challenge + POST com HMAC).
2. Resolucao de tenant via `cloud_api_numbers`.
3. Guard de provider `'cloud_api'`.
4. Normalizacao + dispatch (messages / statuses / account_*).
5. Configurar secrets (`META_APP_SECRET`, `META_VERIFY_TOKEN`).
6. Registrar webhook URL na Meta e validar GET challenge.

### Fase 3: Validacao end-to-end
1. Enviar mensagem real ao numero de teste -> lead/deal/mensagem criados.
2. Validar dedup, avatar, midia, disparo SDR/automacoes.
3. Enviar mensagem de saida (provisoria) e validar `statuses[]` atualizando `delivery_status`.
4. Simular `account_offboarded` / `account_reconnected`.

---

## 7. Riscos e mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Assinatura HMAC quebrada por leitura de body | Ler `req.text()` cru antes de qualquer parse. Testar com payload real da Meta. |
| Meta reenvia webhook por falta de 200 | Sempre 200 em sucesso/skip; erro de item individual nao derruba resposta (D7). |
| `phone_number_id` nao mapeado -> mensagem perdida | Log explicito + resposta 200; alerta para admin cadastrar o numero. |
| Midia exige token autenticado e expira | Baixar no momento do webhook e reupar via handler (storage proprio). |
| Status `read`/`delivered` fora de ordem por concorrencia | Update monotonico por ordem de status (4.4). |
| Constraint de `delivery_status` rejeita novos valores | Migration estende CHECK antes do deploy do endpoint. |

---

## 8. Fora de escopo (deste PRD)

- Envio (outbound) via Cloud API e refactor de `whatsapp-send`.
- Embedded Signup / onboarding self-service de numeros pelo cliente.
- UI de gestao de numeros Cloud API no admin.
- Mensagens de template/HSM e janela de 24h.
- Migracao de empresas Z-API/Evolution para Cloud API.
- Coexistencia avancada (sincronizacao de historico do app WhatsApp).

---

## 9. PVOs - decisoes a validar antes da Spec

| # | Pergunta | Recomendacao |
|---|----------|--------------|
| 1 | Mapeamento `phone_number_id`->empresa: tabela nova `cloud_api_numbers` ou coluna em `companies`? | **Tabela nova** (multi-numero por empresa, metadados Meta, espelha modelo Evolution). |
| 2 | Match de status: por `external_id == wamid`. Ja gravamos o `wamid` retornado no envio? | Garantir que o outbound futuro grave `messages.external_id = wamid`. Por ora, status sem match = ignora. |
| 3 | Suportar `delivered`/`read` ja agora, ou so `sent`/`failed` nesta fase? | **Suportar os 4** (estende CHECK uma vez; UI consome depois). |
| 4 | Valor do guard: reusar `'meta'` (ja no CHECK) ou adicionar `'cloud_api'`? | **`'cloud_api'`** (explicito, sem ambiguidade com Instagram/Meta). |
| 5 | Midia: baixar no `cloud-api-inbound` e passar URL, ou passar `media_id` ao handler? | **Baixar no inbound** (handler fica agnostico de provider). |
| 6 | `account_offboarded`: so atualizar status, ou tambem notificar admin? | Esta versao: **status + log**. Notificacao = iteracao futura. |
| 7 | Webhook unico recebe varios `entry`/`changes` por POST. Processar todos no mesmo request? | **Sim**, loop sobre `entry[].changes[]`, best-effort por item, 200 no fim. |
