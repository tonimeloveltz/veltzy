# SPEC: Métricas de entrega do mkt-ativo (Entregue/Lido por contato)

Trilha: G
Início: 2026-10-04 00:00
Merge: (preencher no merge)

Documento de implementação da etapa 2 da trilha G. Decisões, base legal e escopo estão
no `PRD.md` desta pasta. Aqui: migrations SQL completas, RLS, ordem de execução, arquivos,
contratos e critérios verificáveis.

## Contexto

Ver PRD. Resumo do que o código já tem (confirmado por leitura):
- `veltzy.messages`: `delivery_status` (pending|sent|delivered|read|failed, monotônico),
  `delivery_error`, `external_id` (wamid). RLS ligada (3 policies, por company).
- Provider `cloud_api` retorna `{ externalId: wamid }` (sendMessage/sendTemplate).
- `whatsapp-send` (interativo) já grava `external_id` + `delivery_status`.
- `process-message-queue` (campanha) **descarta** o retorno → mensagem sem `external_id` (GAP).
- `cloud-api-inbound` tem `statuses[]` como placeholder (l.129).
- Veltzy é dono das migrations do schema `veltzy` (pasta `supabase/migrations/`, próxima = 082).

## O que entra / o que não entra

Ver PRD. Entra: capturar wamid no envio de campanha + processar receipts + Entregue/Lido por
contato na tela + toggle default OFF + expurgo 90d. Não entra: respondido, contadores na campanha,
receipts não-oficiais, retrofit de mensagens já enviadas.

## Migrations SQL completas

`supabase/migrations/082_mkt_ativo_delivery_metrics.sql`:

```sql
-- 082 mkt-ativo: métricas de entrega (Entregue/Lido por contato via receipts Cloud API)

-- (1) Elo mensagem -> item da fila (chave do join recipient->mensagem na tela).
ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS message_queue_id uuid
  REFERENCES veltzy.message_queue(id) ON DELETE SET NULL;

-- (2) Timestamp do último receipt (âncora de retenção LGPD + ordenação).
ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz;

-- (3) Index para o join da tela (recipients de uma campanha -> suas mensagens).
CREATE INDEX IF NOT EXISTS idx_messages_message_queue_id
  ON veltzy.messages(message_queue_id)
  WHERE message_queue_id IS NOT NULL;
```

A migration 082 fica **só com as 2 colunas + index** (schema puro). O **expurgo (pg_cron) é
desacoplado** e aplicado À PARTE (pós-migration, NÃO via `db push`) — trilhos separados;
agendamento é ação sensível/Toni; segue o padrão dos demais crons do mkt-ativo.

`supabase/crons/mkt_ativo_expurgo_delivery_metrics.sql` (aplicado à parte):
```sql
-- Expurgo LGPD (90d): após 90 dias do receipt, zera o metadado comportamental
-- (delivered/read volta a 'sent', limpa o timestamp). pg_cron no Central (compartilhado);
-- se o scheduling travar por permissão, aplicar junto aos demais crons do mkt-ativo.
SELECT cron.schedule(
  'mkt_ativo_expurgo_delivery_metrics',
  '17 4 * * *',  -- diário 04:17 UTC
  $$UPDATE veltzy.messages
       SET delivery_status = 'sent', delivery_updated_at = NULL
     WHERE delivery_updated_at < now() - interval '90 days'
       AND delivery_status IN ('delivered','read')$$
);
```

Nota: o toggle `delivery_metrics_enabled` é **JSONB em `companies.features`**, **sem DDL**.
Default OFF = ausência da chave (falsy). Ligar = setar `true` pelo **mesmo mecanismo do
`mkt_ativo_enabled`** (DB/super-admin), **sem tela nova** neste corte. UI de toggle de features
seria outra frente.

## RLS por tabela

- `veltzy.messages`: RLS **já ligada** (3 policies, isoladas por company). As 2 colunas novas
  **herdam** as policies existentes — a migration **não cria nem afrouxa** policy. Leitura da tela
  = client autenticado (company-scoped). Escrita do receipt = service_role na edge, com validação
  de company no código (padrão `cloud-api-inbound`: HMAC + `resolved.companyId`).
- `veltzy.message_queue`: inalterada (já existente). A FK nova de `messages` para ela não muda RLS.

## Ordem de execução (Veltzy only — sem Hub)

1. `npm run preflight` (branch feature, link staging).
2. `supabase migration new mkt_ativo_delivery_metrics` → escrever o SQL do 082 → `supabase db push` (STAGING).
3. `supabase gen types typescript --linked > src/types/database.types.ts` (regen tipos).
4. Implementar o código (edges + front).
5. Deploy das edges no STAGING. ⚠️ **`process-message-queue` e `cloud-api-inbound` são
   compartilhadas de prod**: antes de deployar ao Central (etapa de prod, só sob ordem do Toni),
   **DIFF da fonte deployada vs develop** (não clobberar hotfix) — lição da Leva 2.
6. Produção: migration via `npm run prod:dry`/`prod:apply` + deploy das edges, **só sob ordem do Toni**.

## Arquivos
<!-- arquivos -->
supabase/migrations/082_mkt_ativo_delivery_metrics.sql
supabase/crons/mkt_ativo_expurgo_delivery_metrics.sql
supabase/functions/cloud-api-inbound/delivery-status.ts
supabase/functions/cloud-api-inbound/delivery-status.test.ts
supabase/functions/process-message-queue/index.ts
supabase/functions/cloud-api-inbound/index.ts
src/types/database.ts
src/services/campaigns.service.ts
src/components/campanhas/recipient-list.tsx
<!-- /arquivos -->

(Além de `src/types/database.types.ts` regenerado pelo gen types — coberto pelo allow do pvo.)

## O que fazer em cada arquivo

1. **`supabase/migrations/082_mkt_ativo_delivery_metrics.sql`** (novo) — SQL acima.

2. **`supabase/functions/process-message-queue/index.ts`** (mod)
   - No ramo `cloud_api`, capturar o retorno do envio: `const result = await provider.sendTemplate!(...)`
     / `provider.sendMessage(...)` → guardar `externalId = result?.externalId ?? null`.
   - No INSERT em `messages` (l.195-205): adicionar `external_id: externalId` e
     `message_queue_id: item.id`. (Mesma captura que o `whatsapp-send` já faz na l.209/256.)
   - Só o ramo cloud_api precisa do externalId para receipts; os outros ramos podem gravar
     `message_queue_id: item.id` também (barato, ajuda o join), mas `external_id` fica null fora do oficial.

3. **`supabase/functions/cloud-api-inbound/index.ts`** (mod)
   - Após resolver o tenant (`resolved`), adicionar o ramo:
     ```ts
     if (Array.isArray(value.statuses)) {
       for (const st of value.statuses) {
         await processStatus(supabaseVeltzy, resolved.companyId, st)
       }
     }
     ```
   - `processStatus`: mapeia `st.status` → delivery_status; `UPDATE veltzy.messages SET
     delivery_status, delivery_updated_at = now(), delivery_error = (st.errors?.[0]?.title ?? null)
     WHERE external_id = st.id AND company_id = <resolved>` **com guarda de progressão monotônica**
     (ver Contratos). Gate: antes de processar, checar `delivery_metrics_enabled`; se off, ignora.
   - ⚠️ **O gate lê `public.companies.features`, que é schema PUBLIC** — o `cloud-api-inbound` usa
     `supabaseVeltzy` (schema veltzy). O handler de statuses precisa de um client/query no schema
     **public** (ex.: `createClient(url, key)` sem `db.schema`, ou `.schema('public')`) pra ler
     `companies`. A escrita do `UPDATE messages` continua no `supabaseVeltzy`.
   - Remover o comentário placeholder "statuses[] ... Fase 3 (nao processados aqui)".

3b. **`supabase/functions/cloud-api-inbound/delivery-status.ts`** (novo) — lógica PURA e testável:
   - `shouldApply(current: string | null, next: string): boolean` com a regra monotônica explícita
     (ver Contratos; cobre `sent→failed`).
   - `mapStatus(metaStatus: string): string` (normaliza para o enum).
   - O `processStatus` do index importa daqui (sem HMAC, sem DB → testável isolado).

3c. **`supabase/functions/cloud-api-inbound/delivery-status.test.ts`** (novo) — testes Deno:
   - progressão sent→delivered→read aplica; read→delivered e read→sent NÃO regridem;
     **sent→failed aplica**; delivered→failed NÃO; parse de `statuses[]` (id/status/errors).

4. **`src/types/database.ts`** (mod)
   - `CompanyFeatures`: `+ delivery_metrics_enabled?: boolean` (default OFF = ausência).

5. **`src/services/campaigns.service.ts`** (mod)
   - `RecipientDetail`: `+ delivery_status?: string | null; + delivery_updated_at?: string | null`.
   - `getCampaignRecipientsDetailed`: após buscar os recipients, buscar as entregas por fila:
     ```ts
     const queueIds = recipients.map(r => r.message_queue_id).filter(Boolean)
     const { data: deliveries } = await veltzy().from('messages')
       .select('message_queue_id, delivery_status, delivery_updated_at')
       .in('message_queue_id', queueIds)
     const byQueue = new Map((deliveries ?? []).map(d => [d.message_queue_id, d]))
     // anexa delivery_status/delivery_updated_at em cada recipient pelo message_queue_id
     ```
     (Join por chave `message_queue_id` — não há FK recipient→messages; é query dedicada + map.)

6. **`src/components/campanhas/recipient-list.tsx`** (mod)
   - Nova coluna **"Entrega"** exibida **apenas quando** `delivery_metrics_enabled` (prop do company
     features) e provider oficial: mapeia `delivery_status` → "Enviado" / "Entregue" / "Lido" / "Falha".
     Sem toggle/sem canal oficial → coluna oculta (não promete entrega fora do Cloud API).
   - Sem em-dash; usar palavra/célula vazia.

## Contratos não óbvios

Shape do receipt da Meta (`value.statuses[]`):
```jsonc
{ "statuses": [ {
  "id": "wamid.XXXX",            // = veltzy.messages.external_id
  "status": "sent|delivered|read|failed",
  "timestamp": "1699...",
  "recipient_id": "5511...",
  "errors": [ { "code": 131026, "title": "Message undeliverable" } ]  // só em failed
} ] }
```

Progressão monotônica (não regride):
```
rank = { pending:0, sent:1, failed:1, delivered:2, read:3 }
```
Regra EXPLÍCITA de atualização (aplica o novo status se):
```
rank(novo) > rank(atual)                               -- avanço normal: sent→delivered→read
  OU  (novo === 'failed' E atual IN ('pending','sent')) -- Meta pode aceitar e depois falhar
```
`failed` **NÃO** sobrescreve `delivered`/`read`. ⚠️ O rank estrito sozinho bloquearia
`sent→failed` (ambos rank 1) — por isso o segundo termo é obrigatório; **cobrir `sent→failed`
no teste unitário**. Implementar lendo o `delivery_status` atual antes do UPDATE (ou `WHERE`
que codifique as duas condições).

Elo recipient→mensagem (tela): `blast_recipients.message_queue_id` == `veltzy.messages.message_queue_id`.
`messages` é a fonte da verdade do `delivery_status`; recipient só aponta pela fila. Um recipient
sem mensagem (ex.: pending/sem envio) → sem delivery (coluna vazia).

Gate do receipt: `companies.features.delivery_metrics_enabled === true`. Off = não grava delivery
(privacy by design); a mensagem segue existindo com `delivery_status='sent'`.

## Critérios de aceite

- [ ] Migration 082 aplicada no staging (2 colunas + index + cron de expurgo); tipos regenerados.
- [ ] Envio de campanha Cloud API grava `messages.external_id` (wamid) e `message_queue_id`.
- [ ] `cloud-api-inbound` processa `statuses[]`: delivered/read/failed atualiza a mensagem certa
      (por wamid), monotônico, isolado por company, **só se toggle on**.
- [ ] Tela de detalhe mostra coluna "Entrega" (Enviado/Entregue/Lido/Falha) por contato quando
      toggle on + Cloud API; oculta caso contrário.
- [ ] Toggle default OFF; ligar faz a UI e o receipt passarem a funcionar.
- [ ] Progressão monotônica correta, **incluindo `sent→failed`** (e `failed` não sobrescreve
      delivered/read) — coberta por teste unitário Deno verde.
- [ ] Expurgo 90d aplicado à parte (cron), fora da migration; RLS de `messages` intacta (não afrouxada).
- [ ] `tsc -b` + `npm run build` + `deno test` (delivery-status) + `npm run pvo -- specs/mkt-ativo-metricas-entrega/SPEC.md` verdes.

### Plano de verificação (sem número real; Copiloto não tem o segredo HMAC do staging)

1. **Testes unitários Deno** (`delivery-status.test.ts`) — rigoroso, sem HMAC nem DB:
   monotonicidade (incl. `sent→failed`), não-regressão, parse de `statuses[]`. `deno test` verde.
   (A verificação da assinatura HMAC em si já é exercida pelo fluxo `messages[]` existente —
   mesmo `verifyMetaSignature` — então não re-provar a assinatura é aceitável.)
2. **Opção B (tela, sem HMAC):** semear fixture no staging — campanha Cloud API com 1 recipient
   cujo `message_queue` tem `veltzy.messages` com `message_queue_id` ligado; `UPDATE` direto
   simulando o receipt (`delivery_status` sent→delivered→read). Provar na tela: coluna "Entrega"
   refletindo Entregue→Lido; **toggle OFF → coluna some**. Teardown (resíduo zero).
3. **Opção A (ponta a ponta, só se o Toni fornecer o META secret do staging):** `POST` payload
   `statuses[]` assinado (HMAC) na `cloud-api-inbound` com `phone_number_id` mapeado → prova o
   caminho completo sent→delivered→read + gate. Fica condicionada ao segredo.
