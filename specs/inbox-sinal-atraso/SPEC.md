# SPEC: Inbox, sinal discreto de atraso + mensagens do celular

Trilha: G
Início: 2026-11-20 07:15
Merge: (preencher no merge)

PRD: `specs/inbox-sinal-atraso/PRD.md`

## Contexto
Ver PRD (diagnóstico e estado atual). Sem migration. Dois repos: Veltzy (front + 2 edges) e Hub (`waha-webhook-receiver`).

## Arquivos
<!-- arquivos -->
specs/inbox-sinal-atraso/SPEC.md
specs/inbox-sinal-atraso/PRD.md
src/lib/needs-reply.ts
src/lib/needs-reply.test.ts
src/lib/response-sla.ts
src/lib/response-sla.test.ts
src/hooks/use-conversation-list.ts
src/components/inbox/conversation-item.tsx
src/components/inbox/conversation-list.tsx
src/stores/inbox.store.ts
supabase/functions/_shared/ack-message.ts
supabase/functions/_shared/ack-message.test.ts
supabase/functions/_shared/waha-message-id.ts
supabase/functions/_shared/waha-message-id.test.ts
supabase/functions/check-sla/index.ts
supabase/functions/waha-inbound/index.ts
supabase/functions/whatsapp-send/index.ts
supabase/functions/process-message-queue/index.ts
<!-- /arquivos -->

Hub (repo `~/projetos/hub`, SPEC espelho não necessária; arquivos):
- `supabase/functions/waha-webhook-receiver/index.ts`
- `supabase/functions/waha-instance-manage/index.ts` (eventos `message` + `message.any` + `session.status`)
- `supabase/functions/waha-webhook-receiver/from-me.ts`
- `supabase/functions/waha-webhook-receiver/from-me_test.ts`

## Blocos e ordem
- **B1 (Veltzy front)**: needs-reply + lista + item + filtro. Independente.
- **B2 (Veltzy edges)**: `_shared/ack-message.ts`, `check-sla`, `waha-inbound` com `from_me` + verificação de dedupe. Deploy das duas no staging.
- **B3 (Hub)**: receiver encaminha `fromMe` atrás do secret. Só começa com B2 publicado no staging (contrato `from_me`).
B1 e B2 em paralelo na codificadora Veltzy (mesma branch). B3 na codificadora Hub depois do OK da copiloto.

## O que fazer em cada arquivo

### B1
**`src/lib/needs-reply.ts`** (novo, puro, testável)
```ts
export const isAckMessage = (content: string | null, messageType: string): boolean
export const needsReply = (lead: LeadWithLastMessage): boolean
export const isOverdue = (lead: LeadWithLastMessage, slaHours: number, now?: number): boolean
```
- `isAckMessage`: `sticker` e `reaction` = true. Texto: normaliza (lowercase, sem acento, sem pontuação, trim). True se vazio após remover emojis (só emoji), ou se ≤ 40 chars e todas as palavras estão no conjunto de fechamento: `ok okay oks blz beleza obrigado obrigada obg brigado brigada valeu vlw combinado perfeito certo certinho show top otimo sim ss entendi fechado tranquilo tmj joia legal massa bom dia boa tarde boa noite` (+ variações óbvias como `muito`, `pelo envio`, `de nada`, `ta`, `tá`). Áudio, imagem, documento, vídeo = false (podem pedir resposta).
- `needsReply`: `last_message.sender_type === 'lead'` && `!isAckMessage(...)` && status ∉ {`resolved`, `waiting_client`}.
- `isOverdue`: `needsReply` && `now - last_message.created_at > slaHours*3600e3`. `slaHours <= 0` → 2.

**`src/lib/needs-reply.test.ts`**: casos do diagnóstico ("Combinado ☺", "Ok 👍", "Sim", "Obrigado pelo envio", "Muito obrigada", "Olá bom dia! Tudo bem e com você? ..." = precisa), sticker, áudio, IA última = não precisa, `waiting_client` = não precisa.

**`src/hooks/use-conversation-list.ts`**: remover prioridade de `sla_breached` no sort; ordenar só por recência. Novo filtro `filters.status === 'needs_reply'` → `result.filter(needsReply)` (não compara com `conversation_status`).

**`src/stores/inbox.store.ts`**: tipo de `status` aceita `'needs_reply'`.

**`src/components/inbox/conversation-list.tsx`**: `<SelectItem value="needs_reply">Aguardando resposta</SelectItem>` logo após "Todos".

**`src/components/inbox/conversation-item.tsx`**: remover `getWaitingMinutes`, `isWarning`, ramo `sla_breached` do className (borda volta a `border-l-transparent`) e Clock vermelho. Usar `isOverdue(lead, slaHours)` (`useBusinessRules().sla_hours`, buscar o hook já existente uma vez na lista e passar por prop se o hook não for cacheado): horário com `text-amber-600 dark:text-amber-500` + `<Clock className="h-3 w-3" />` da mesma cor. Tooltip/title: "Aguardando resposta há X". Sem fundo, sem borda (memória: nunca borda lateral de destaque).

### B2
**`supabase/functions/_shared/ack-message.ts`**: mesma `isAckMessage` do front (duplicada, comentário apontando a gêmea em `src/lib/needs-reply.ts`; Deno não importa de `src/`).

**`supabase/functions/check-sla/index.ts`**:
- Ler `sla_alert_enabled` junto do `sla_hours`.
- Marcação: considerar resposta `sender_type in ('human','ai')`; pular se a última mensagem do lead for fechamento (`isAckMessage`) ou status `waiting_client`.
- Limpeza: última mensagem `human` **ou** `ai` limpa; também limpa se a última do lead for fechamento.
- Notificação só se `sla_alert_enabled === true`.

**`supabase/functions/waha-inbound/index.ts`**:
- `from_me?: boolean` no payload.
- `from_me === true` → `senderType: 'human'`, `skipSideEffects: true`, `senderName: null`, `profilePicUrl: null`.
- **Achado da leitura (Hub, 2026-11-20)**: todo outbound do Veltzy via WAHA grava `external_id` NULL (`whatsapp-send/index.ts:168` descarta `result.externalId` no ramo evolution/waha; Central: 93 human + 227 ai em 20 dias, todos NULL). O receiver encaminha `message_id = key.id` cru (ex.: `A555FB...`); o `waha-send-message` do NOWEB devolve o mesmo `key.id`.
- **`whatsapp-send/index.ts`**: gravar `externalId = result.externalId` no ramo evolution/waha. Mesmo conserto em `process-message-queue` e `prospect-dm-send` se o caminho waha deles descartar o id.
- **`waha-inbound`**: normalizar `message_id` (se vier `true_...`/`false_..._<id>`, usar o sufixo após o último `_`).
- **`lead-inbound-handler.ts`, só quando `senderType='human'` e `skipSideEffects`**: defesa contra corrida (echo chegando antes do INSERT do envio): se não achou por `external_id`, descartar se existir mensagem do mesmo lead com `sender_type in ('human','ai')`, mesmo `content` e `message_type`, criada nos últimos 120 s. Não muda o caminho do cliente (`senderType='lead'`).
- **Dedupe obrigatório**: conferir no `whatsapp-send` (ramo waha) e em `waha-send-message` do Hub qual id é gravado em `messages.external_id` para envios do Veltzy (SDR, vendedor, campanha) e comparar com o `key.id`/`p.id` que o receiver encaminha como `message_id`. Se o formato divergir (ex.: `true_5511...@c.us_3EB0...` vs `3EB0...`), normalizar no `waha-inbound` antes de chamar o handler (extrair o id final) e registrar a regra em "Decisões tomadas". Sem dedupe garantido, B3 não liga.
- Deploy no staging.

### B3 (Hub)
**`waha-webhook-receiver/index.ts`**:
- `const forwardFromMe = Deno.env.get('WAHA_FORWARD_FROM_ME') === 'true'`.
- `skip = (fromMe && !forwardFromMe) || isStatus || isGroup || isNewsletter || isHistory`.
- Para `fromMe`: só produto Veltzy (Lemya continua ignorando `fromMe`); `phone` = destinatário (`p.to` ou `key.remoteJid`, mesmo `extractPhone` aplicado ao destino); `normalized.from_me = true`; sem `sender_name`.
- Confirmado: NOWEB só entrega `fromMe` em `message.any`; a sessão assina hoje `['message','session.status']` (`waha-instance-manage/index.ts:94`). Decisão: assinar os dois (`message` + `message.any`). `waha-instance-manage` passa a criar sessões com `message.any`; a sessão de produção `veltz-group` é atualizada na promoção, com OK do Toni. Tratar `eventType === 'message.any' && fromMe` pelo mesmo caminho (ignorar `message.any` com `fromMe=false`, que já chega como `message`) e listar na entrega a mudança de eventos do webhook da sessão `veltz-group` (é produção, a copiloto pede OK ao Toni).
- Mídia do `fromMe` usa o mesmo `persistWahaMedia`.

## Contratos não óbvios
Payload Hub → Veltzy `waha-inbound` (aditivo):
```json
{ "company_id": "...", "session_name": "veltz-group", "phone": "<lead>", "content": "...",
  "message_type": "text", "message_id": "<id>", "timestamp": 1763630000, "from_me": true }
```

## Critérios de aceite
- [ ] Inbox sem faixa/fundo vermelho; ordem = última mensagem desc.
- [ ] "Combinado", "Ok 👍", "Sim", "Obrigado", sticker: sem sinal.
- [ ] Mensagem real do cliente sem resposta há mais que `sla_hours`: horário âmbar + relógio.
- [ ] Última mensagem da IA ou do vendedor: sem sinal.
- [ ] `waiting_client` ou `resolved`: sem sinal.
- [ ] Filtro "Aguardando resposta" mostra só as que precisam de resposta (com ou sem atraso).
- [ ] `check-sla` não cria notificação com `sla_alert_enabled=false`.
- [ ] `waha-inbound` com `from_me=true` grava `sender_type='human'`, não cria oportunidade nem aciona SDR.
- [ ] Envio pelo Veltzy via WAHA não duplica quando o echo chega (dedupe por `external_id`).
- [ ] Hub sem `WAHA_FORWARD_FROM_ME`: comportamento idêntico ao atual.
- [ ] `npm run build` verde (Veltzy), testes de `needs-reply` verdes, `deno check` sem erro novo nas edges.

## Decisões tomadas
- Critério calculado no front a partir de `last_message`, não do `sla_breached` (que fica obsoleto com respostas do celular e da IA).
- `isAckMessage` duplicada front/edge em vez de pacote compartilhado: arquivo pequeno, sem build cruzado.
- Âmbar em vez de vermelho: sinal discreto, alinhado ao pedido. Sem token `warning` no DS; `text-amber-600` já é o padrão de fato (15 usos em `src/`).
- `sla_hours` inválido cai em 2h (default do hook), não 30 min como o `check-sla` fazia.
- Sessão WAHA assina `message` + `message.any` (não só `message.any`): o caminho atual do cliente fica intacto e o novo depende só do secret.
- Dedupe do echo só por `external_id` (UNIQUE parcial `(company_id, external_id)` em `veltzy.messages`). Corrida echo-antes-do-INSERT: o envio (`whatsapp-send`, `process-message-queue`) trata `23505` fazendo UPDATE da linha do echo com os dados do envio (sender_type, instance_name, delivery). Substitui a defesa por conteúdo em 120 s; `lead-inbound-handler.ts` fica fora do escopo.
- Id WAHA normalizado nos dois lados (`_shared/waha-message-id.ts`): sufixo após o último `_`. Receiver manda `_data.key.id` cru (conferido em `waha_webhook_events`); o envio pode vir serializado (`true_<jid>_<id>`).
- `prospect-dm-send` não grava em `messages` (só `prospect_dm_log.waha_external_id`): sem mudança. Com B3 ligado, o echo da DM entra no histórico do lead como `human`, sem efeitos colaterais.
- `whatsapp-send` grava `externalId` também no ramo evolution (o provider devolve `{}` hoje: sem efeito); normalização só no waha.
- `needs-reply.ts` reaproveita `responseSlaMs` de `response-sla.ts`; `hasPendingReply`/`isResponseOverdue` saíram (substituídos por `needsReply`/`isOverdue`) e os testes de limite migraram para `needs-reply.test.ts`.
- `overdueIds` continua calculado uma vez no hook da lista (tick de 30 s) e passado ao item por prop.
- `isAckMessage`: risada (`kkk`, `rsrs`, `haha`) conta como fechamento; "não" isolado não (pode ser resposta que pede continuação).
- `check-sla`: marcação pula `waiting_client` além de `resolved`; limpeza também limpa `waiting_client`.
- `whatsapp-send` e `process-message-queue` também publicados no staging (sem eles o `external_id` continua NULL e o dedupe não funciona).
- RPC `get_conversation_list` mantém `ORDER BY sla_breached`: o front reordena; evita migration.

### Hub (B3, `feature/waha-forward-from-me`, c3957d0)
- Evento `message` com `fromMe` continua em skip; só `message.any` encaminha `fromMe` (evita duplicar, já que a sessão assina os dois).
- `message.any` com `fromMe=false` responde 200 sem gravar em `waha_webhook_events` (já chega como `message`).
- `phone` do `fromMe` = `remoteJidAlt` (LID) ou `to`/`remoteJid`, sem `sender_name`. LID sem `remoteJidAlt`: warn e não encaminha.
- E2E só em produção (WAHA único): Hub sobe com `WAHA_FORWARD_FROM_ME` desligado; depois o webhook da sessão `veltz-group` ganha `message.any` (OK do Toni); por último liga o secret.
- Isolamento Lemya: `fromMe` de sessão `product='lemya'` nunca é encaminhado (`routeMessageEvent` → skip, coberto em `from-me_test.ts:16`); a Iris envia só por sessão `product='lemya'` (`lemya-wa-dispatch`/boas-vindas/instance), número separado do comercial do Veltzy. Conversa da assistente não entra no inbox do Veltzy.
