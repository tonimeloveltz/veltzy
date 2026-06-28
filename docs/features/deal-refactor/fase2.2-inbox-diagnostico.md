# Fase 2.2 (diagnóstico) — Inbox para de depender de negócio

READ-ONLY. Plano para a RPC `get_conversation_list` parar de retornar
`stage_id`, `status`, `deal_value` do lead. Nada foi alterado.

## 1. Shape atual da RPC `get_conversation_list`

Definição vigente: `supabase/migrations/047_conversation_list_evolution_fields.sql`
(histórico 014 → 021 → 023 → 030 → 047; 047 é a mais recente). Assinatura
`(p_company_id UUID)`, `RETURNS TABLE` com 34 colunas, todas do lead + joins.

**Campos de NEGÓCIO (a remover) — 3:**
- `stage_id UUID` (l.54/63)
- `status TEXT` (l.19/64) — é `leads.status` (enum lead_status) castado p/ text
- `deal_value NUMERIC` (l.27/72)

> A RPC **não** retorna `pipeline_id` (já não fazia parte do shape).

**Campos de CONTATO / CONVERSA (manter) — 31:**
id, company_id, name, phone, email, instagram_id, linkedin_id, source_id,
temperature, ai_score, assigned_to, is_ai_active, is_queued, conversation_status,
tags, observations, avatar_url, ad_context, created_at, updated_at,
last_customer_message_at, sla_breached, whatsapp_instance_name, transfer_summary,
assigned_name, assigned_email, assigned_available, source_name, source_slug,
source_color, source_icon, last_message_content, last_message_at,
last_message_sender, last_message_type, unread_count.

Ordenação da RPC: `sla_breached DESC, last_message.created_at DESC` — **não usa**
nenhum dos 3 campos de negócio. Removê-los não afeta ordenação nem filtro.

## 2. Consumo no frontend

**Único caller da RPC:** `messages.service.ts:getConversationList` (l.66). O mapper
(l.73-119) converte cada coluna para `LeadWithLastMessage`. Mapeia os 3 de negócio:
- `stage_id: row.stage_id` (l.79)
- `status: row.status` (l.80)
- `deal_value: row.deal_value` (l.88)

**Consumidores do tipo `LeadWithLastMessage`:**
- `use-conversation-list.ts` (lista filtrada) — usa: last_message, assigned_to,
  name, phone, email, company_name, conversation_status, sla_breached, updated_at,
  unread_count. **Nenhum** dos 3 de negócio.
- `conversation-item.tsx` (linha da lista) — usa name, phone, avatar, temperature,
  last_message, unread, conversation_status, sla. **Não renderiza** stage/status/valor.
- `chat-header.tsx` / `chat-window.tsx` — recebem o lead; **não leem** stage_id/
  status/deal_value. (chat-header lê `lead.pipeline_id` p/ nome do pipeline — mas a
  RPC já não retorna pipeline_id; ver §4 observação.)
- `contact-panel.tsx` — `.status` ali é de **task** (l.479-491), não do lead.
- `pages/inbox.tsx` — busca a conversa selecionada; não lê os 3 campos.

**Filtro de status do inbox:** `conversation-list.tsx:46-47` usa `filters.status`
(`ConversationStatus | 'all'`: unread/replied/waiting_client/resolved) que filtra
`conversation_status` (use-conversation-list l.48) — **não** o `status` de negócio.

**Conclusão §2:** os 3 campos passam pelo mapper mas **não são exibidos nem usados**
em nenhum ponto do inbox. Remover não quebra nada visual.

## 3. Painel lateral — já busca deal por conta própria? SIM

`lead-deals-panel.tsx` (dentro do `contact-panel`) busca via
**`useDealsByLead(leadId)`** (l.10/33) → `getDealsByLead` (deals.service). Os
`.status` dele (l.39/40/78/79) são de **deals**, não da RPC de conversas. Logo,
remover os 3 campos da RPC **não afeta** o painel — ele já lê negócio de `deals`.

## 4. Impacto de remover os 3 campos da RPC

Pontos a ajustar (apenas estes):
1. **RPC** (`get_conversation_list`): remover `stage_id`, `status`, `deal_value` do
   `RETURNS TABLE` e do `SELECT`. Manter o resto. Via Dashboard (DROP + CREATE).
2. **Mapper** `messages.service.ts`: remover as 3 linhas (l.79, 80, 88).
3. **Tipo** `LeadWithLastMessage` (`database.ts:380`): hoje `extends Lead`, então
   herda stage_id/status/deal_value. Trocar para
   `extends Omit<Lead, 'stage_id' | 'status' | 'deal_value'>` para o tipo refletir
   o novo shape e o compilador pegar usos futuros indevidos.

Nenhum outro arquivo precisa mudar (nenhum lê os 3 campos do item de conversa).

**Observação fora de escopo (pré-existente):** `chat-header.tsx:30` lê
`lead.pipeline_id`, que a RPC já não retorna (e o mapper não preenche) → hoje o
nome do pipeline no header do inbox já vem vazio. Não faz parte desta remoção;
sinalizado para tratar quando o inbox precisar de pipeline (buscar via deal).

## 5. Riscos e ordem segura

- **Acoplamento RPC↔frontend: nenhum.** O frontend **já não usa** os 3 campos.
  Por isso a mudança pode ser feita nos dois lados de forma independente, sem
  janela de quebra:
  - Se o frontend mudar primeiro (mapper+tipo): a RPC ainda retorna os campos, que
    passam a ser ignorados — sem efeito.
  - Se a RPC mudar primeiro: o mapper leria `row.stage_id` = `undefined` — inócuo,
    pois ninguém usa.
- **Ordem recomendada:** (1) frontend (mapper + tipo) em develop; (2) RPC via
  Dashboard (revisão do Toni), como migração nova (ex: `068_conversation_list_drop_business_fields.sql`),
  documentada mas aplicada manualmente — sem CLI.
- **Risco da RPC:** é `DROP FUNCTION; CREATE FUNCTION` (mudança de assinatura).
  Rodar o bloco inteiro de uma vez (transacional no SQL Editor) para não deixar a
  função ausente entre o drop e o create.
- **Sem consumidor externo:** a RPC é `veltzy.*` e só o `messages.service` a chama
  (confirmado por grep). Hub não usa.
- **Verificação pós:** inbox carrega a lista, filtra por conversa, abre conversa,
  painel lateral mostra os negócios (via deals) — tudo sem os 3 campos.
