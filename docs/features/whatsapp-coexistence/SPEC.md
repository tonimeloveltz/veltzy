# SPEC — Onda 3 (Veltzy): Cloud API oficial em modo COEXISTENCE

> **Fase SDD:** 2 (Spec). Autor: Copiloto Veltzy+Hub · Data: 2026-07-27
> **Escopo:** frentes do Veltzy. O backend de onboarding (subscribed_apps + sync) está em `hub/docs/features/whatsapp-coexistence-onboarding/SPEC.md`.
> **Fonte Meta:** doc oficial "Onboard WhatsApp Business app users" (Coexistence) + webhook `smb_message_echoes`. Consultada 2026-07-27.
> **Status:** APROVADO pelo Toni em 2026-07-27 ("go. manda ver"). Decisões D-V1/V2/V3 fechadas (ver §Decisões). Correções factuais de schema aplicadas (ver §Correções de schema). Liberado para implementação seguindo a ordem de dependências.

---

## 0. Contexto (o que muda no Coexistence)
No Coexistence o número do cliente segue usando o **app WhatsApp Business** E a Cloud API ao mesmo tempo. Consequência para o Veltzy: além das mensagens que os contatos enviam (webhook `messages`, já tratado), passamos a receber **ecos** das mensagens que o próprio dono manda pelo app (`smb_message_echoes`) e, no onboarding, um dump de **histórico** (`history`) e **contatos** (`smb_app_state_sync`). O inbox precisa refletir isso para não ficar "meia conversa".

## 0.1 Correções de schema (validadas contra o código real pela Codificadora, 2026-07-27)
Três premissas da spec original divergiam do schema de `veltzy.messages`. Correções obrigatórias, já refletidas no texto abaixo:

1. **NÃO existe `messages.direction`.** O schema usa `sender_type` enum (`'ai' | 'human' | 'lead'`) (migration 010:113, confirmado na 049). Um eco (`smb_message_echoes`) é mensagem que o DONO mandou pelo app, logo grava com `sender_type='human'` (mesma convenção do outbound do vendedor). Toda menção a "direction=out" na spec deve ser lida como `sender_type='human'`.
2. **NÃO existe `messages.is_history`.** A V1.2 depende dessa flag para não disparar SDR/automação em mensagens antigas. Precisa **migration nova** em `veltzy.messages` (coluna `is_history BOOLEAN NOT NULL DEFAULT false` + índice). Essa migration **precede** a V1. SQL vai como pedido separado (staging→Central por passo do Toni, nunca `db push`).
3. **O handler compartilhado (`_shared/lead-inbound-handler.ts`) é acoplado a inbound de LEAD.** Grava `sender_type='lead'` fixo (:158-171) e SEMPRE dispara deal + SDR + automação + auto-reply (:224-306). Echoes precisam gravar `sender_type='human'` e **PULAR os side-effects** (senão a IA responde a própria mensagem do dono). Logo a V1 exige **parametrizar `senderType` + um modo skip-side-effects no handler** (ou um caminho separado para echoes), não é só um branch novo. O esforço real da V1 é maior que o texto original sugeria.

Base atual confirmada:
- Inbound: `supabase/functions/cloud-api-inbound/index.ts` resolve tenant por `phone_number_id` (`:71,:75`), guard `active_whatsapp_provider==='cloud_api'` (`:81-91`), trata `value.messages[]` (`:94-98`) via `processMessage` (`:115-224`) e delega ao `_shared/lead-inbound-handler.ts`.
- Resolver de número: `_shared/cloud-api-resolve.ts:23-44` retorna `{companyId, instanceLabel, accessToken, status}` — **não retorna `id`**.
- Modelo: `veltzy.cloud_api_numbers` (migration 068/069), `leads.cloud_api_number_id` existe (069) mas **não é carimbado no inbound** e falta no tipo `Lead` (`src/types/database.ts`).

---

## FRENTE V1 — Inbound: tratar webhooks de coexistence

### V1.1 `smb_message_echoes` (prioridade máxima)
Payload (doc): `value.messaging_product`, `value.metadata.{display_phone_number, phone_number_id}`, `value.message_echoes[]` com `{from, to, id, timestamp, type, <conteúdo>}`. `type` ∈ text|image|video|document|revoke|edit. Semântica: mensagem que o dono do número mandou pelo app → deve entrar no inbox com **`sender_type='human'`** (não existe `direction`; ver §0.1) no lead cujo telefone = `to`.

Mudanças em `cloud-api-inbound/index.ts`:
- Detectar `value.message_echoes` (hoje só trata `value.messages`). Adicionar branch que itera `message_echoes[]`.
- Resolver o lead pelo par (`companyId`, telefone `to`). Se não existe lead, criar (mesma lógica de inbound, mas a mensagem grava como `sender_type='human'` e SEM disparar SDR/automação/auto-reply — ver §0.1 item 3).
- Gravar `messages` com `sender_type='human'`, `instance_name = resolved.instanceLabel`, `external_id = m.id` (idempotência: dedupe por `external_id` para não duplicar com o eco de mensagens que nós mesmos enviamos via Cloud API — ver V1.4).
- `type` `revoke` → marcar mensagem apagada; `edit` → atualizar conteúdo. **D-V1 (fechada): só registrar** nesta onda, sem tratar edit/revoke a fundo (o CHECK de `message_type` nem aceita esses tipos, cai no fallback text). Registrar e logar.

### V1.2 `history`
Dump de até 180 dias. Estrutura do payload: `value.history[].threads[].messages[]`; o telefone do lead é o `id` da thread (o contato) e o `sender_type` de cada mensagem é derivado de quem enviou (`from` == contato → `'lead'`, senão a empresa → `'human'`; ver §0.1). Grava com a flag **`is_history=true`** (coluna NOVA, migration 070 que precede a V1) para não disparar automações/SDR/auto-reply. Idempotência por `external_id`. Mídia histórica **não** é baixada (`skipMedia`): pode estar expirada e o volume travaria o webhook; preserva tipo/caption/mime, `file_url` fica null.

**Processamento (correção da spec original):** a Meta entrega o history **fragmentado em chunks/fases** (vários webhooks), então cada invocação trata um pedaço — processar **inline por chunk**, best-effort por mensagem. `process-message-queue` **NÃO serve** aqui: é fila de OUTBOUND (lê `message_queue` e envia via provider, grava `sender_type='ai'`); history é ingestão inbound. Se o PVO mostrar volume alto por chunk, evoluir para ingestão assíncrona (ver ressalva de timeout no §PVO).

**Flag-day suavizado:** a chave `is_history` só entra no INSERT quando `isHistory=true` (spread condicional no handler). Mensagens normais não referenciam a coluna, então o deploy do código **não** fica refém da 070: sem a migration, só a importação de history falha, o inbound normal segue intacto. O PVO da importação ainda espera a 070 aplicada pelo Toni, mas o merge não depende dela.

**D-V2 (fechada): importar com flag `is_history` e limitar a exibição** (não poluir as conversas ativas); a importação em si pode trazer os 180d, mas a UI limita o que mostra por padrão.

### V1.3 `smb_app_state_sync` (contatos)
Nesta onda: apenas logar/contar (não materializar contatos no CRM). Decisão D-H3 no Hub.

### V1.4 Anti-duplicação crítica
Mensagens que NÓS enviamos pela Cloud API (`whatsapp-send`→Hub) também retornam como `smb_message_echoes`. Regra: dedupe por `external_id` (wamid). Quando enviamos, já gravamos `messages.external_id = wamid` (confirmar em `whatsapp-send`/`CloudApiHubProvider`); o eco com o mesmo wamid deve ser ignorado (UPDATE de status no máximo, nunca novo INSERT).

### V1.5 Guard de provider
Manter o guard `active_whatsapp_provider==='cloud_api'` (`:81-91`) também nos novos branches.

---

## FRENTE V2 — Multi-número (carimbar o número de origem)

Hoje o inbound não persiste em qual número Cloud API o lead conversa, então o outbound cai no `is_default` — quebra quando a empresa tem N números.

- `cloud-api-resolve.ts`: `resolveCloudApiNumber` passa a retornar também `id` (uuid de `cloud_api_numbers`). Atualizar interface `ResolvedNumber`.
- `lead-inbound-handler.ts` / `InboundParams`: receber `cloudApiNumberId` e persistir `leads.cloud_api_number_id` na criação/atualização do lead (inbound e echoes).
- `src/types/database.ts`: adicionar `cloud_api_number_id: string | null` em `Lead` e no input de criação.
- Outbound (`whatsapp-send`, branch `cloud_api`) já lê `lead.cloud_api_number_id` via `resolveOutboundCloudApiNumber` — validar que, uma vez carimbado, responde pelo número certo.

---

## FRENTE V3 — Alinhar `use-whatsapp-status`

`src/hooks/use-whatsapp-status.ts` hoje retorna `connected:true` fixo quando provider==='cloud_api' (`:29-30`), sem verificar se há número realmente conectado. Alinhar:
- Para `cloud_api`: derivar `connected` de existir ≥1 linha ativa em `cloud_api_numbers` (reusar `use-cloud-api-connection`), não fixo.
- Expor o modo (`coexistence` vs futuro `migration`) e, se possível, um status de saúde (subscribed_apps_ok/sync) vindo das flags do onboard.
- Não quebrar os ramos `evolution`/`zapi`.

---

## FRENTE V4 — UI multi-número + Embedded Signup coexistence

### V4.1 Evento de conclusão coexistence
`src/lib/meta-embedded-signup.ts` hoje espera evento `FINISH` do `WA_EMBEDDED_SIGNUP`. No coexistence o evento é **`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`**. Tratar ambos (migração futura e coexistence). Extrair `code`, `phone_number_id`, `waba_id` igualmente.
- Config do Embedded Signup (`config_id` = `VITE_META_ES_CONFIG_ID`) precisa estar habilitado para "business app numbers" no painel Meta (ação de config do Toni). A UI mostra a tela "conectar conta existente".

### V4.2 Lista N números (coexistência plena)
Hoje `use-cloud-api-connection` faz `limit(1)` (mostra só 1 número oficial). Para multi-número, refatorar o card oficial para listar N (padrão de `WhatsAppInstances`), com badge "Padrão" no `is_default`, e permitir conectar número adicional. Escopo: espelhar o que o QR/Evolution já faz.
- **D-V3 (fechada): piloto vai com 1 número.** A V4.2 (UI multi-número) é a ÚLTIMA frente e pode ir logo após o piloto. O piloto E2E na Veltz Demonstração roda com 1 número; a UI multi-número não bloqueia o piloto.

---

## FRENTE V5 (menor) — Health check
`check-whatsapp-health` filtra `provider IN ('zapi','evolution')` (`:21`). Cloud API não é coberto. Adicionar cobertura simples para `cloud_api` (ex.: status derivado das flags do onboard / ping leve ao Hub), sem inventar chamadas Graph pesadas.

---

## Ordem de execução (aprovada, com as correções de §0.1)
1. Schema no Hub (colunas de auditoria) + frente do Hub (subscribed_apps + sync). Regerar tipos. (repo hub, codificadora do Hub, em paralelo)
2. **Migration `is_history` em `veltzy.messages`** (coluna + índice). SQL como pedido separado, aplicação por passo do Toni. PRECEDE a V1.
3. V2 (carimbo multi-número). Independente do Hub; pode começar já (a coluna `leads.cloud_api_number_id` já existe na migration 069).
4. **Refactor do handler**: parametrizar `senderType` + modo skip-side-effects em `_shared/lead-inbound-handler.ts` (§0.1 item 3). Precede a V1.
5. V1 (echoes/history). Depende de V2 (carimbo), da migration `is_history` e do refactor do handler.
6. V3 (status).
7. V4 (UI + evento coexistence). V4.2 (multi-número) é a última.
8. V5 (health).
9. PVO E2E com a Veltz Demonstração (receber msg, mandar pelo app e ver o eco com `sender_type='human'`, responder pelo Veltzy). Nada em produção/cliente real antes desse PVO passar.

### Checklist obrigatório do PVO (V1.2 history)
- **Migration 070 aplicada** pelo Toni (Dashboard) antes de exercitar o import de history.
- **Config do Embedded Signup** habilitada para "business app numbers" no painel Meta (ação do Toni) — necessária para o fluxo coexistence e para o evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (V4.1).
- **Medir tempo por chunk de history** (RISCO a validar): hoje o loop de history é aguardado ANTES do `return 200`. Se um chunk vier com muitas mensagens, cada uma faz várias queries em série (buscar/criar lead + dedupe + insert) e pode passar do tempo que a Meta tolera, causando **re-entrega do chunk** (o dedupe por `external_id` evita duplicar, mas a re-entrega repetida desperdiça). `skipMedia` já tirou a parte mais lenta. **Mitigação se estourar:** responder 200 na hora e processar o history detached via `EdgeRuntime.waitUntil` (Supabase). Não implementado agora para não fazer over-engineering antes de medir com volume real.

## Evidências obrigatórias por PR
`npx tsc --noEmit` limpo · `npm run build` limpo · `git diff` nos arquivos certos · teste no browser (staging/preview) para as frentes com UI.

## Decisões (fechadas pelo Toni em 2026-07-27)
- **D-V1 = só registrar.** Não tratar edit/revoke a fundo nesta onda (o CHECK de `message_type` nem aceita esses tipos). Ver V1.1.
- **D-V2 = flag `is_history` + limitar exibição.** Importar com a flag; a UI limita o que mostra por padrão para não poluir conversas ativas. Depende da migration nova (§0.1 item 2). Ver V1.2.
- **D-V3 = piloto com 1 número.** UI multi-número (V4.2) é a última frente, logo após o piloto. Ver V4.2.
