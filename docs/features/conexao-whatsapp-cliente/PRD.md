# PRD: Conexao de WhatsApp Client-Facing (Frente 2)

Tela onde o cliente da empresa conecta o proprio numero de WhatsApp, escolhendo entre as categorias que o Hub liberou para ele. Inclui o Embedded Signup oficial da Meta (caminho API Oficial) e reusa o fluxo de QR Code ja existente (caminho nao oficial). A allowlist do que cada cliente pode ver e Hub-owned.

**Status:** Research / PRD. Nao avancar para Spec antes de aprovacao.
**Repos afetados:** Veltzy (frontend + edge functions) e Hub (schema + edge function + painel admin). Cross-repo por natureza.
**Pre-requisito de leitura:** este PRD reflete o codigo como esta HOJE (pos Cloud API). Os specs `whatsapp-multi-provider` e `whatsapp-admin-ui` sao anteriores ao Cloud API e estao defasados. Use este PRD como fonte de verdade.

---

## 1. Contexto e objetivo

Hoje a conexao de numero WhatsApp e operada nos bastidores:

- **Evolution (QR Code):** ja tem self-service no Veltzy (`whatsapp-instances.tsx` + `whatsapp-connect-dialog.tsx`), mas exposto apenas para `admin`/`super_admin` na aba de integracoes, sem nocao de "cardapio" de categorias.
- **Cloud API (oficial):** o motor de mensagens funciona ponta a ponta, mas o numero e cadastrado manualmente (ver `docs/features/cloud-api-integration/seed-dev.sql`). Nao existe onboarding self-service. A aba de integracoes mostra apenas um card "Configurado pelo suporte" (`HubManagedCard`).

O objetivo desta frente e dar ao **cliente final** (admin da empresa) uma tela unica de conexao de WhatsApp que:

1. Mostra somente as categorias que o Hub liberou para aquela empresa (allowlist).
2. Usa labels neutros de produto, sem revelar o motor real por tras.
3. Bifurca para o fluxo correto: Embedded Signup da Meta (oficial) ou QR Code (nao oficial, reusa o que existe).
4. Suporta multiplos numeros por empresa, com config de SDR por numero e escolha de numero pelo vendedor.

---

## 2. Restricoes ja decididas (dado de entrada, NAO reabrir)

Estas decisoes sao premissas fechadas. O PRD parte delas.

1. **Menu client-facing tem exatamente 2 categorias fixas, com labels neutros:**
   - `"WhatsApp API Oficial"` (Cloud API da Meta por tras)
   - `"Conexao via QR Code"` (provider nao oficial por tras, hoje Evolution)

   O cliente NUNCA ve o nome do provider real (Evolution, Z-API). Qual motor alimenta o QR Code e decisao interna do Hub.

2. **Allowlist Hub-owned, por empresa.** O Hub controla quais das 2 categorias cada empresa ve. Modelado como configuracao de empresa no schema `public` (Hub-owned), coluna nova (caminho A ja decidido). Default: ON para as 2 categorias em todas as empresas existentes, para nao quebrar ninguem na introducao. Desligar e excecao manual.

3. **Separar o que a Meta ve do que o cliente ve.** No video do App Review nao pode aparecer mencao a provider nao oficial. A allowlist resolve: na empresa de gravacao, apenas a categoria oficial fica habilitada.

4. **Hub e dono da credencial e da infra; Veltzy so consome.** O Veltzy le a allowlist (read-only) e nunca detem token da Meta. Padrao ja estabelecido no ciclo Cloud API.

---

## 3. Fundacao existente (reusar, NAO redesenhar)

Mapeamento do codigo real. Tudo abaixo ja esta implementado e mergeado.

### 3.1 Abstracao de provider (Veltzy)

- `supabase/functions/_shared/whatsapp-provider.ts:3` define
  `WhatsAppProviderType = 'zapi' | 'evolution' | 'cloud_api'`.
- `whatsapp-factory.ts` registra os 3 providers como singletons: `createProvider(type)`.
- `whatsapp-config.ts:getActiveProvider()` le `companies.active_whatsapp_provider` (fallback `'zapi'`).
- Providers concretos: `providers/cloud-api.ts` (chama Hub `cloud-api-send-message`), `providers/evolution-hub.ts` (chama Hub `evolution-send-message`), `providers/zapi.ts` (legado).

### 3.2 Cloud API ponta a ponta (Veltzy)

- **Inbound:** `cloud-api-inbound/index.ts` valida HMAC (`meta-signature.ts`), resolve tenant por `phone_number_id` (`cloud-api-resolve.ts:resolveCloudApiNumber`), faz guard de provider, baixa midia (`cloud-api-media.ts`) e delega ao handler compartilhado `lead-inbound-handler.ts`.
- **Outbound:** `whatsapp-send/index.ts` roteia por provider; para Cloud API resolve numero via `resolveOutboundCloudApiNumber` (prioridade: `lead.cloud_api_number_id` > default `is_default` da empresa) e chama `providers/cloud-api.ts`, que faz m2m para o Hub.
- **Tabela:** `veltzy.cloud_api_numbers` (migration 068): `phone_number_id` (UNIQUE), `waba_id`, `display_number`, `instance_label`, `access_token`, `status ('active'|'offboarded')`. Migration 069 adiciona `is_default` (unique parcial por empresa) e `leads.cloud_api_number_id` (FK).
- **Tipo frontend:** `src/types/database.ts` espelha `CloudApiNumber` e `WhatsAppProviderType`.

### 3.3 Fluxo QR Code (Evolution) self-service (Veltzy)

- **Edge intermediaria:** `whatsapp-instance-manage/index.ts` valida JWT + role (`admin`/`super_admin`), valida ownership por `company_id`, e faz proxy para o Hub `evolution-instance-manage` com `HUB_SERVICE_ROLE_KEY`. Metodos POST/GET/PATCH/DELETE.
- **UI:** `whatsapp-instances.tsx` (lista + acoes) e `whatsapp-connect-dialog.tsx` (maquina de estados `idle -> loading -> qr_pending -> connected | expired | error`, timeout QR 2 min, polling status 3s lendo a tabela direto via RLS).
- **Hooks/Service:** `use-whatsapp-instances.ts`, `whatsapp-instances.service.ts`.
- **Entrada:** `integrations-tab.tsx:WhatsAppCard()` bifurca por provider: `evolution` renderiza `WhatsAppInstances`; `cloud_api` e `zapi` renderizam `HubManagedCard`.

### 3.4 Infra Hub

- **Evolution:** `evolution-instance-manage` (CRUD completo, quota por plano), `evolution-send-message`, `evolution-webhook-receiver` (recebe da Evolution e faz forward para o Veltzy). Tabela `public.evolution_instances` (Hub-owned, Veltzy le via RLS). Painel admin em `src/pages/company-detail.tsx` aba WhatsApp -> `src/components/whatsapp/whatsapp-tab.tsx` (dropdown de provider, lista de instancias, `qr-code-dialog.tsx`).
- **Cloud API:** `cloud-api-send-message/index.ts` envia via Graph API v25.0 usando `META_SYSTEM_USER_TOKEN` (env global, m2m so service_role). Retorna `wamid`.

### 3.5 Contrato Hub <-> Veltzy estabelecido

- **m2m:** Veltzy chama edge functions do Hub com `Authorization: Bearer HUB_SERVICE_ROLE_KEY`. O Hub valida token exato.
- **Banco compartilhado:** mesmo Supabase Central. `public.*` e Hub-owned; Veltzy le via RLS (`company_id = get_current_company_id() OR is_super_admin()`). `veltzy.*` e Veltzy-owned.
- **Webhook forward:** Hub -> Veltzy via `apikey: HUB_WEBHOOK_SECRET`.

---

## 4. Desalinhamentos detectados (tratar antes ou durante)

Itens que o research levantou e que impactam o desenho. Nao sao a feature em si, mas bloqueiam ou arriscam.

1. **CHECK de `active_whatsapp_provider` desalinhado entre repos.** No Hub o CHECK so aceita `('zapi','wuzapi','revolution','meta')`. No Veltzy ja aceita `evolution` e `cloud_api` (migrations 046 e 068). Como a coluna mora em `public` (Hub-owned), o Hub precisa de migration para expandir o CHECK, senao o painel do Hub nao consegue setar `cloud_api`/`evolution` de forma consistente. **Acao:** migration no Hub na Onda 0.

2. **Ownership de `cloud_api_numbers`.** A tabela mora em `veltzy.cloud_api_numbers`, mas guarda `access_token` da Meta, que arquiteturalmente deveria ser Hub-owned (restricao 4). Hoje funciona porque o token efetivo e o `META_SYSTEM_USER_TOKEN` global do Hub e a coluna `access_token` e fallback. **Decisao para o PRD:** manter a tabela onde esta por ora (nao migrar dado neste pacote), mas registrar a divida. O Embedded Signup vai gravar `phone_number_id` e `waba_id` (nao segredos de longa duracao) nessa tabela; o token de troca fica no Hub. Ver Onda 2.

3. **Token Meta global vs por numero.** `cloud-api-send-message` usa um unico `META_SYSTEM_USER_TOKEN`. Com Embedded Signup, cada empresa conecta a propria WABA. O modelo de token por numero/WABA e um delta futuro, fora do MVP, mas o contrato precisa ser desenhado para nao travar depois (ver secao 6.2 e Onda 2).

---

## 5. Arquitetura proposta (visao geral)

```
Cliente (admin da empresa) no Veltzy
  |
  v
[Tela de Conexao WhatsApp]  --le-->  allowlist (public.companies, Hub-owned, read-only via RLS)
  |
  |-- categoria "WhatsApp API Oficial"  --> [Embedded Signup Meta]
  |        login Facebook do cliente, escolhe WABA, conecta numero
  |        callback retorna phone_number_id + waba_id
  |        --> edge intermediaria Veltzy (valida role) --> Hub registra numero
  |        --> grava veltzy.cloud_api_numbers (phone_number_id, waba_id)
  |
  |-- categoria "Conexao via QR Code"  --> [fluxo whatsapp-connect-dialog EXISTENTE]
           reusa whatsapp-instance-manage -> Hub evolution-instance-manage
```

Principios:

- A tela so renderiza categorias habilitadas na allowlist. Se so uma estiver ON, vai direto ou mostra so ela.
- Labels sempre neutros. O mapeamento label -> provider real e interno.
- Veltzy nunca detem token Meta. O Embedded Signup entrega `phone_number_id`/`waba_id`; o Hub guarda/troca segredos.

---

## 6. Deltas (o que e novo)

### 6.1 Allowlist Hub-owned

**Onde mora:** coluna nova em `public.companies` (caminho A). Proposta de shape:

```sql
ALTER TABLE public.companies
  ADD COLUMN whatsapp_categories jsonb NOT NULL
  DEFAULT '{"official": true, "qr_code": true}'::jsonb;
```

- Duas chaves fixas: `official` (WhatsApp API Oficial) e `qr_code` (Conexao via QR Code). Booleanas.
- Default ON para as duas em todas as empresas existentes (backfill garantido pelo DEFAULT do DDL, sem UPDATE manual).
- Nomes de chave neutros do ponto de vista de produto (nao citam Evolution/Cloud API). O mapeamento chave -> provider e interno.

**Como o Veltzy le:** read-only via RLS (a policy de `companies` ja permite `company_id = get_current_company_id() OR is_super_admin()`). Um hook `useWhatsAppCategories()` no Veltzy le a coluna direto via Supabase client. Nao precisa edge function so para ler.

**UI no Hub (super_admin):** na aba WhatsApp da empresa (`whatsapp-tab.tsx` em `company-detail.tsx`), adicionar dois toggles ("API Oficial", "QR Code") que persistem em `companies.whatsapp_categories`. Esse e o lugar natural (o super_admin ja gerencia provider e instancias ali).

**Contrato Hub -> Veltzy:** o dado e a propria coluna no banco compartilhado. Hub escreve (via painel, com sessao super_admin), Veltzy le (RLS). Sem nova superficie de API.

### 6.2 Embedded Signup da Meta (peca nova de verdade)

Fluxo client-side onde o cliente loga no Facebook dele, escolhe a WABA dele e conecta o numero Cloud API. QR Code nao tem signup da Meta; este caminho e exclusivo da categoria oficial.

**Componentes do fluxo:**

1. **SDK do Facebook (client-side):** carregar o Facebook JS SDK e iniciar o Embedded Signup via `FB.login` com `config_id` (configuracao do Embedded Signup no painel Meta) e escopo `whatsapp_business_management`, `whatsapp_business_messaging`. O fluxo abre o popup da Meta; ao concluir, retorna um `code` (Sessions Logging) ou os dados de WABA via mensagem do popup.

2. **O que o callback retorna:** ao final do Embedded Signup, o app recebe (via evento do SDK / message do popup) o `waba_id` e o `phone_number_id` do numero conectado. Esses identificadores nao sao segredos de longa duracao.

3. **Onde persistir:** `veltzy.cloud_api_numbers` (como hoje), gravando `phone_number_id`, `waba_id`, `display_number`, `status='active'`. Ressalva arquitetural registrada na secao 4.2: idealmente Hub-owned no futuro. Para o MVP, manter no Veltzy e aceitar a divida.

4. **Resolucao de token (futuro):** hoje o envio usa `META_SYSTEM_USER_TOKEN` global no Hub. O modelo correto e: o Hub troca o `code` do Embedded Signup por um token de sistema da WABA do cliente e o guarda Hub-side, resolvendo por `phone_number_id` no envio. Este e um delta de Onda 2; o MVP pode operar com o token global enquanto a base de clientes oficiais for pequena, desde que o numero esteja sob a mesma BM. **Decisao a confirmar na Spec:** se o MVP exige token por WABA desde o inicio ou se aceita o token global temporariamente.

**Edge intermediaria:** seguir o padrao de `whatsapp-instance-manage`. Uma function Veltzy (ex: `cloud-api-onboard`) valida JWT + role `admin`/`super_admin`, recebe `phone_number_id`/`waba_id`/`code`, repassa ao Hub (m2m) para registro/troca de token, e grava o numero. O Veltzy nunca chama a Graph API direto para troca de token.

### 6.3 Configuracao no painel da Meta (checklist de App Review)

Secao-roteiro para configurar o app Meta depois. Pre-requisitos para o Embedded Signup rodar:

- **Facebook Login for Business** habilitado no app.
- **Configuracao do Embedded Signup** criada, gerando um `config_id` (usado no `FB.login`).
- **Permissoes** solicitadas e aprovadas: `whatsapp_business_management`, `whatsapp_business_messaging`.
- **Dominios autorizados** (App Domains + OAuth redirect): `app.veltzy.com`, `develop.app.veltzy.com`, `localhost` para dev.
- **Business Verification** da Meta Business concluida.
- **App Review:** gravar video demonstrando o Embedded Signup ponta a ponta. No video, a empresa de gravacao deve ter apenas a categoria oficial habilitada na allowlist (restricao 3), para nao aparecer mencao a provider nao oficial.
- **Webhook** do produto WhatsApp apontando para `cloud-api-inbound` com o verify token correto e assinatura HMAC (`META_APP_SECRET`) ja configurada.

Esta secao vira checklist operacional na fase de configuracao, fora de codigo.

### 6.4 Tela client-facing de escolha

Componente novo (ex: `whatsapp-connect-choice.tsx`) que:

- Le a allowlist via `useWhatsAppCategories()`.
- Renderiza somente as categorias habilitadas, com labels neutros e descricao curta.
- Bifurca:
  - "WhatsApp API Oficial" -> inicia Embedded Signup (6.2).
  - "Conexao via QR Code" -> abre o `whatsapp-connect-dialog` existente (3.3), sem recriar nada.
- Se apenas uma categoria estiver ON, pode pular a tela de escolha e ir direto ao fluxo unico.
- Substitui/expande o `HubManagedCard` de Cloud API em `integrations-tab.tsx`, mantendo o card como fallback quando nenhuma categoria estiver habilitada.

### 6.5 Restante do pacote multi-numero

Como cada item toca a fundacao existente:

- **Filtro de instancia por numero:** o inbox/conversas ja carimba `messages.instance_name` e `leads.whatsapp_instance_name` (Evolution) e `leads.cloud_api_number_id`/`instance_label` (Cloud API). Delta: expor um filtro por numero na UI de conversas, usando esses campos ja existentes.
- **Config de SDR por numero:** hoje `pipelines.sdr_instance_name` define instancia dedicada de SDR (Evolution). Para Cloud API, falta o analogo (ex: `pipelines.sdr_cloud_api_number_id`). Delta de schema + UI de pipeline.
- **Escolha de numero pelo vendedor ao enviar:** `whatsapp-send` ja aceita override `instanceName` (Evolution). Para Cloud API, o envio resolve por `lead.cloud_api_number_id` ou default. Delta: permitir o vendedor escolher o numero de origem no compositor, persistindo o vinculo no lead (`cloud_api_number_id`) ou passando override no payload.

---

## 7. Contrato Hub <-> Veltzy (explicito)

Mesmo que a implementacao seja fatiada (Hub primeiro), o contrato e:

| Item | Dono (escrita) | Veltzy (consumo) | Mecanismo |
|------|----------------|------------------|-----------|
| `companies.whatsapp_categories` (allowlist) | Hub (painel super_admin) | Read-only | Banco compartilhado + RLS |
| `companies.active_whatsapp_provider` (CHECK expandido) | Hub | Read | Banco compartilhado + RLS |
| Registro de numero Cloud API + troca de token | Hub (edge) | Dispara via edge intermediaria | m2m `HUB_SERVICE_ROLE_KEY` |
| `veltzy.cloud_api_numbers` (phone_number_id, waba_id) | Veltzy (grava pos-onboard) | Read/Write | Schema veltzy (divida arquitetural registrada) |
| Envio Cloud API | Hub (`cloud-api-send-message`) | Dispara | m2m, ja existente |
| Webhook inbound | Meta -> Veltzy `cloud-api-inbound` | Recebe | HMAC `META_APP_SECRET` |

Ordem de implementacao cross-repo: **Hub primeiro** (CHECK + allowlist write + onboarding/token), depois **Veltzy** (leitura da allowlist + tela + Embedded Signup client-side).

---

## 8. Ondas de implementacao (testaveis e fatiadas)

Implementar tudo de uma vez e risco alto. Quebrar em ondas, cada uma entregavel e testavel isolada.

### Onda 0: Alinhamento de schema (Hub)
- Migration no Hub expandindo CHECK de `active_whatsapp_provider` para incluir `evolution` e `cloud_api`.
- Migration no Hub adicionando `companies.whatsapp_categories jsonb` com default `{"official": true, "qr_code": true}`.
- **Teste:** super_admin consegue setar provider `cloud_api` no painel sem erro de CHECK; toda empresa existente ja nasce com as 2 categorias ON.
- **Sem impacto no cliente.** Pura fundacao.

### Onda 1: Allowlist read no Veltzy + tela de escolha (sem Embedded Signup)
- Hook `useWhatsAppCategories()` lendo `companies.whatsapp_categories`.
- Componente `whatsapp-connect-choice.tsx` renderizando categorias habilitadas com labels neutros.
- Bifurcacao: QR Code abre o dialog existente; oficial mostra placeholder "em configuracao" (Embedded Signup ainda nao).
- Toggles da allowlist no painel do Hub (`whatsapp-tab.tsx`).
- **Teste:** super_admin liga/desliga categorias no Hub; cliente ve apenas o que esta ON; QR Code conecta normalmente (reuso). Empresa de gravacao do App Review fica so com oficial.

### Onda 2: Embedded Signup oficial (Hub + Veltzy)
- Onboarding edge no Hub: troca `code` por token da WABA do cliente, registra numero, guarda segredo Hub-side.
- Edge intermediaria Veltzy `cloud-api-onboard` (valida role, repassa ao Hub, grava `cloud_api_numbers`).
- Client-side: Facebook JS SDK + `FB.login` com `config_id`, captura `phone_number_id`/`waba_id`, dispara onboarding.
- **Pre-requisito externo:** painel Meta configurado (secao 6.3) e App Review submetido.
- **Teste:** cliente conecta numero proprio via popup Meta; numero aparece em `cloud_api_numbers`; envio e recebimento funcionam ponta a ponta para esse numero.
- **Decisao pendente para a Spec:** token global temporario vs token por WABA desde o MVP.

### Onda 3: Multi-numero (filtro, SDR por numero, escolha pelo vendedor)
- Filtro de conversas por numero (campos ja existentes).
- `pipelines.sdr_cloud_api_number_id` + UI de pipeline para SDR Cloud API.
- Escolha de numero de origem no compositor do vendedor (override no envio / vinculo no lead).
- **Teste:** empresa com 2+ numeros roteia inbound e outbound corretamente; SDR usa o numero configurado; vendedor escolhe origem ao enviar.

Cada onda fecha um ciclo testavel. Ondas 0 e 1 nao dependem do App Review da Meta e podem rodar imediatamente. Onda 2 depende de configuracao externa do painel Meta. Onda 3 e independente das demais apos a Onda 0.

---

## 9. Fora de escopo (desta frente)

- Migrar `cloud_api_numbers` de `veltzy` para `public` (Hub-owned). Divida registrada, tratada em frente propria se necessario.
- Processamento de `value.statuses[]` da Meta (delivery/read) no inbound (Fase 3 do Cloud API, ja documentada em outro pacote).
- Suporte a mais de 2 categorias no menu client-facing. Sao exatamente 2, fixas.
- Provider novo no QR Code (a categoria QR Code abstrai o motor; trocar Evolution por outro e decisao interna futura).
- Templates de mensagem (HSM) e gestao de catalogo da Meta.

---

## 10. Riscos e mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| App Review da Meta ver mencao a provider nao oficial | Allowlist desliga QR Code na empresa de gravacao (restricao 3). Validar antes de gravar. |
| Token Meta global nao escala para muitos clientes oficiais | Onda 2 desenha troca de token por WABA Hub-side. MVP limita volume. |
| Divida de ownership de `cloud_api_numbers` | Registrada; nao bloqueia MVP; revisitar em frente propria. |
| Desalinhamento de CHECK entre repos | Onda 0 corrige no Hub antes de qualquer UI. |
| Cliente conectar numero ja em uso por outra empresa | `phone_number_id` e UNIQUE em `cloud_api_numbers`; onboarding deve tratar conflito com erro claro. |

---

## 11. Resumo das ondas

- **Onda 0 (Hub):** alinhar CHECK de provider + criar coluna `whatsapp_categories` com default ON. Fundacao, sem impacto no cliente.
- **Onda 1 (Veltzy + Hub):** ler allowlist no Veltzy, tela de escolha client-facing com labels neutros, toggles no painel do Hub. QR Code reusa o fluxo existente; oficial fica como placeholder.
- **Onda 2 (Hub + Veltzy):** Embedded Signup da Meta ponta a ponta (SDK client-side, onboarding edge, troca de token Hub-side). Depende da configuracao do painel Meta e do App Review.
- **Onda 3 (Veltzy):** multi-numero completo (filtro por numero, SDR por numero Cloud API, escolha de numero pelo vendedor).

Ordem recomendada: 0 -> 1 -> 2 -> 3. Ondas 0 e 1 sao desbloqueadas de imediato; a Onda 2 aguarda configuracao externa da Meta.
