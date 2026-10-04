# PRD: Métricas de entrega do mkt-ativo (ENTREGUE/LIDO por contato)

Trilha: G
Início: 2026-10-04 00:00

## Problema e objetivo

Hoje a tela de detalhe da campanha (Bloco 1) mostra o status do envio por contato
(enviado/falhou/na fila), mas **não mostra se a mensagem foi ENTREGUE nem LIDA**. Quem
dispara não sabe se o template chegou no WhatsApp do contato. O objetivo deste 1º corte
é expor, por contato, os estados **Entregue** e **Lido**, usando os receipts (status
callbacks) que a Meta já manda — **só para o canal oficial (Cloud API)**.

Como rastrear "lido" é **tratamento de dado pessoal novo** (metadado comportamental do
titular), a frente é trilha G e exige bloco LGPD + toggle por empresa.

## Estado atual (codebase e schema)

Confirmado por leitura (staging espelha o Central):

- **`veltzy.messages`** já tem a infra de entrega (migration 068): `delivery_status`
  (`pending|sent|delivered|read|failed`, progressão monotônica), `delivery_error`,
  `external_id` (= wamid da Meta). RLS **ligada** (3 policies, isolada por company).
  Index `(company_id, delivery_status, created_at)`.
- **Envio interativo** (`whatsapp-send`) **já captura** `external_id = result.externalId`
  e grava `delivery_status` (l.209/256) → receipts funcionariam nele.
- **Envio de campanha** (`process-message-queue`, ramo `cloud_api`) **DESCARTA o retorno**
  do envio: insere em `veltzy.messages` **sem `external_id`** (l.195-205). ⚠️ Esse é o gap:
  sem `external_id`, o receipt (que casa por wamid) nunca acha a mensagem da campanha.
- **Provider Cloud API** (`_shared/providers/cloud-api.ts`) **retorna** `{ externalId: wamid }`
  em `sendMessage` (l.73) e `sendTemplate` (l.117) → o wamid está disponível, só não é usado.
- **Receipt**: `cloud-api-inbound` (edge DO VELTZY, escreve schema `veltzy`, HMAC,
  `external_id=wamid`) tem o `statuses[]` como **placeholder** ("Fase 3 não processados", l.129).
  Esse é o ramo a implementar.
- **Elo recipient ↔ mensagem**: `blast_recipients.message_queue_id → message_queue`.
  `message_queue` **não tem** `external_id` nem FK para `messages`; `messages` **não tem**
  `message_queue_id` nem `campaign_id`. **Não há hoje chave confiável** ligando o recipient
  à mensagem que carrega o `delivery_status`. Fechar esse elo é o cerne deste PRD.

## Requisitos funcionais

1. **Capturar o wamid no envio de campanha.** O `process-message-queue`, no ramo `cloud_api`,
   passa a usar o `externalId` retornado pelo provider e gravá-lo em `veltzy.messages.external_id`,
   além de ligar a mensagem ao item da fila (ver Modelo de dados).
2. **Processar receipts.** O `cloud-api-inbound` ganha o ramo `change.field === 'statuses'`:
   para cada `value.statuses[]`, mapear `status` (`sent|delivered|read|failed`) + `id` (=wamid)
   → `UPDATE veltzy.messages SET delivery_status=..., delivery_updated_at=now() WHERE external_id=wamid`,
   respeitando a **progressão monotônica** (não regride read→delivered) e isolado por company.
3. **Exibir Entregue/Lido por contato** na tela de detalhe da campanha (recipient-list), derivado
   do `delivery_status` da mensagem ligada ao recipient. Fonte da verdade = `veltzy.messages`.
4. **Toggle por empresa, default OFF.** `companies.features.delivery_metrics_enabled` (JSONB, sem DDL),
   **nasce desligado** (privacy by design). A empresa **liga explicitamente**. Com o toggle **off**:
   não processa receipts para a empresa e a UI não mostra Entregue/Lido.
5. **Só Cloud API neste corte.** WAHA/Evolution/Z-API não têm receipt processado aqui (a coluna
   fica em `sent` para esses canais; a UI não promete entrega fora do oficial).

## Repos envolvidos e contrato entre eles

**Somente o Veltzy.** Justificativa: o *receipt* chega no `cloud-api-inbound`, que é edge do
Veltzy e já escreve no schema `veltzy` (não passa pelo Hub). O *envio* de campanha usa
`cloud-api-send-template`/`process-message-queue`, também do Veltzy. O Hub é dono da infra
Evolution/WAHA, que **não entram** neste corte. Nenhuma migration no Central é de contrato
entre repos — são tabelas do schema `veltzy` (owned pelo Veltzy). Nenhum trabalho no Hub.

⚠️ **Cautela de deploy (nota pra SPEC):** `process-message-queue` e `cloud-api-inbound` são
edges **compartilhadas de produção** no Central. As mudanças são **aditivas** (capturar
`external_id`+`message_queue_id`; ramo `statuses[]`), mas o deploy ao Central exige **DIFF da
fonte deployada vs develop antes de redeployar** (não clobberar hotfix), lição da Leva 2.

## Modelo de dados

Dono: Veltzy (schema `veltzy`). Sem tabela nova; 2 colunas + a decisão do elo.

**Decisão do elo (recomendada): a mensagem é a fonte da verdade; o recipient chega nela
pelo `message_queue_id`.** Em vez de duplicar estado de entrega em `blast_recipients`
(que ficaria dessincronizado do receipt), ligamos `messages` ao item da fila e a tela faz
o join. Assim o receipt atualiza **um** lugar (`messages.delivery_status`) e tanto o inbox
quanto a campanha leem de lá.

Mudanças:
1. `ALTER TABLE veltzy.messages ADD COLUMN message_queue_id uuid REFERENCES veltzy.message_queue(id) ON DELETE SET NULL;`
   — preenchido pelo `process-message-queue` ao criar a mensagem do envio de campanha. Index
   `(message_queue_id)` para o join da tela.
2. `ALTER TABLE veltzy.messages ADD COLUMN delivery_updated_at timestamptz;`
   — timestamp do último receipt (âncora de retenção LGPD + ordenação).
3. **Sem coluna nova em `blast_recipients`.** A tela deriva assim:
   `blast_recipients.message_queue_id` → `veltzy.messages` onde `messages.message_queue_id` bate
   → usa `delivery_status`/`delivery_updated_at`. (Query dedicada no service; detalhe na SPEC.)
4. Toggle: `companies.features.delivery_metrics_enabled` (JSONB, sem DDL), espelha `mkt_ativo_enabled`.

RLS: `veltzy.messages` já tem RLS por company (confirmado) — a leitura da tela é isolada por
tenant. O receipt roda via service_role na edge, com validação de company no código (HMAC +
`resolved.companyId`), padrão do `cloud-api-inbound`.

Migrations completas (SQL) + RLS por tabela + ordem entre repos entram na SPEC.md (etapa 2 da G).

## LGPD (obrigatório — dado pessoal novo)

Rastrear **entrega/leitura** é metadado comportamental do titular (lead).

**Papéis (LGPD):** a **empresa cliente** é a **controladora** (decide a finalidade, liga o toggle,
responde pelo tratamento); **Veltzy/Daxen** é **operadora** (trata em nome da controladora,
segue instruções, não usa o dado para fim próprio).

| Dado | Finalidade | Base legal | Retenção | Exclusão |
|------|-----------|-----------|----------|----------|
| `delivery_status` = delivered/read | Medir eficácia do disparo oficial p/ a empresa | Legítimo interesse do controlador (empresa cliente), com opt-out do titular já vigente no mkt-ativo | Proposto **90 dias** após `delivery_updated_at`, depois expurgo do metadado de entrega (volta a `sent`/null) via `pg_cron` | Hard delete junto com a mensagem (cascata por lead) + a pedido do titular |
| `delivery_updated_at` | Ordenar/datar o receipt; âncora de retenção | Idem | Idem (expurgado no mesmo job) | Idem |
| `external_id` (wamid) | Casar o receipt com a mensagem | Execução do serviço de envio | Vida da mensagem | Cascata por lead |

Pontos obrigatórios:
- **Minimização:** só guardamos o estado agregado (delivered/read) e o timestamp. Não guardamos
  device, IP, nem conteúdo do receipt além do status.
- **Base legal (legítimo interesse) + LIA:** finalidade legítima = medir a eficácia do próprio
  disparo oficial da empresa; necessidade = metadado mínimo (só status agregado + timestamp, sem
  device/IP/conteúdo); balanceamento = baixo impacto ao titular + o **opt-out do mkt-ativo já
  vigente** serve de **via de oposição (Art. 18)**: se o lead sai, para de receber E de ser medido.
  O "lido" é metadado de uma mensagem que o titular já consentiu receber; **nota a acrescentar na
  Política de Privacidade** ("medimos entrega e leitura das mensagens oficiais").
- **Toggle por empresa** (`delivery_metrics_enabled`): a empresa liga/desliga o tratamento;
  off = não processa nem exibe.
- **Retenção/expurgo:** `pg_cron` diário zera `delivery_status`>sent e `delivery_updated_at`
  após 90 dias (número a confirmar com o Toni).
- **Transferência internacional:** os receipts vêm da Meta (EUA) via Cloud API — coberto pelo
  DPA da Meta já vigente no uso do WhatsApp Cloud API; registrar no PRD como transferência
  com cláusulas-padrão/adequação da Meta.
- **Direito do titular:** exclusão a pedido remove as mensagens do lead (cascata já existente
  `messages.lead_id ON DELETE CASCADE`), incluindo os metadados de entrega.

## O que não entra

- "Respondido" por contato (vínculo mensagem↔campanha para resposta) — Onda futura.
- Contadores agregados de entrega na própria campanha (`blast_campaigns`) — Onda futura.
- Receipts de **WAHA/Evolution/Z-API** (só Cloud API neste corte).
- Retrofit de `external_id` em mensagens de campanha **já enviadas** antes desta frente
  (não há wamid salvo; ficam sem Entregue/Lido).
- Métricas em tempo real/push na tela (a tela revalida ao navegar; realtime fica para depois).

## Critérios de aceite

- [ ] Envio de campanha via Cloud API grava `veltzy.messages.external_id` (wamid) e
      `message_queue_id` (elo com o item da fila).
- [ ] `cloud-api-inbound` processa `statuses[]`: receipt `delivered`/`read`/`failed` atualiza
      `delivery_status` + `delivery_updated_at` da mensagem certa (por wamid), com progressão
      monotônica, isolado por company.
- [ ] Tela de detalhe da campanha mostra, por contato, **Entregue** e **Lido** (além do já
      existente enviado/falhou/na fila), derivados da mensagem ligada.
- [ ] Com `delivery_metrics_enabled=false`: receipts não processados e UI sem Entregue/Lido.
- [ ] Canais não-oficiais não exibem entrega (ficam em enviado).
- [ ] `pg_cron` de expurgo (90d) criado; RLS de `messages` mantida; LGPD coberta (política + DPA).
- [ ] tsc/build verdes; PVO (SPEC) + prova no browser no staging com receipt simulado.
