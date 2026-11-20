# PRD: Inbox, sinal discreto de atraso + mensagens do celular

Trilha: G
Início: 2026-11-20 07:15
Merge: 2026-11-20 10:40

## Problema e objetivo
A faixa vermelha do inbox (`sla_breached`) agrupa no topo conversas "atrasadas" com critério errado:
1. Mensagem que o dono responde pelo celular (WAHA, sessão `veltz-group`) não entra no Veltzy: o Hub descarta `fromMe`. A conversa parece sem resposta.
2. Resposta da IA não conta como resposta (`check-sla` só limpa com `sender_type='human'`).
3. Fechamentos do cliente ("Obrigado", "Ok 👍", "Combinado", "Sim") viram atraso.
4. `check-sla` cria notificação "Lead aguardando resposta" mesmo com `sla_alert_enabled=false`.

Diagnóstico (Central, Veltz Group, 2026-11-20): 269 leads `sla_breached`, 11 visíveis no inbox; 8 dos 11 terminam em fechamento; Karina/Bira têm respostas do celular ausentes no banco.

Objetivo: lista simples ordenada por recência, atraso como sinal discreto na própria conversa, critério de "precisa de resposta" que ignora fechamentos e conta IA, e mensagens enviadas pelo celular registradas no histórico.

## Estado atual (codebase e schema)
- Veltzy `src/hooks/use-conversation-list.ts`: ordena `sla_breached` primeiro.
- Veltzy `src/components/inbox/conversation-item.tsx`: `border-l-destructive bg-destructive/5` + Clock vermelho.
- Veltzy `supabase/functions/check-sla/index.ts`: cron `*/5`, marca/limpa `leads.sla_breached`, insere notificação sem olhar o toggle.
- Hub `supabase/functions/waha-webhook-receiver/index.ts`: `skip = fromMe || ...`; Veltzy recebe via `waha-inbound`.
- Veltzy `cloud-api-inbound` já trata echo do dono (`senderType='human'`, `skipSideEffects=true`, dedupe por `external_id`). Mesmo padrão serve ao WAHA.

## Requisitos funcionais
1. Lista do inbox ordenada só por última mensagem. Sem faixa/fundo vermelho.
2. Sinal discreto (horário em âmbar + ícone de relógio pequeno) quando a conversa "precisa de resposta" e passou de `business_rules.sla_hours`.
3. "Precisa de resposta" = última mensagem é do cliente, não é fechamento, status não é `resolved` nem `waiting_client`. Resposta de vendedor ou IA zera.
4. Filtro de status ganha "Aguardando resposta".
5. Notificação de atraso só com `sla_alert_enabled=true`, mesmo critério do item 3.
6. Mensagem enviada pelo celular no número WAHA entra no histórico como `sender_type='human'`, sem disparar SDR/automação/oportunidade, sem duplicar mensagens enviadas pelo próprio Veltzy.

## Repos envolvidos e contrato entre eles
- Veltzy `waha-inbound` aceita campo opcional `from_me: boolean` (ausente = false). Com `from_me=true`: `senderType='human'`, `skipSideEffects=true`, `senderName=null`, `phone` = telefone do lead (destinatário).
- Hub `waha-webhook-receiver`: DM `fromMe` deixa de ser descartada quando o secret `WAHA_FORWARD_FROM_ME=true`; encaminha com `from_me: true` e `phone` extraído do destinatário (`p.to` / `key.remoteJid`). Sem o secret, comportamento atual.
- Ordem: Veltzy `waha-inbound` publicado antes do Hub. Em produção, Hub sobe dark (secret desligado), liga depois de conferir.

## Modelo de dados
Sem mudança de schema. `leads.sla_breached` segue existindo (o RPC `get_conversation_list` lê); a UI deixa de usar.

## LGPD
Sem dado pessoal novo: conteúdo de mensagens WhatsApp do mesmo titular já tratado pelo inbox (execução de contrato / legítimo interesse já vigentes). Sem mudança de retenção.

## O que não entra
- Classificação por IA de "precisa de resposta" (heurística primeiro; IA só se a heurística falhar na prática).
- Remover a coluna `sla_breached` ou alterar o RPC.
- Echo do celular para Evolution/Z-API.
- Edit/revoke de mensagem do celular.

## Critérios de aceite
Ver SPEC.

## Decisões tomadas
- Heurística local de fechamento em vez de IA: custo zero, previsível; IA fica para depois se não bastar.
- "Sim" curto conta como fechamento: Toni pediu menos alerta, e o sinal é discreto.
- Forward de `fromMe` atrás de secret no Hub: o WAHA só existe em produção, o E2E só acontece lá; liga/desliga sem deploy.
- `waiting_client` também zera o sinal: é a forma manual existente de dizer "não preciso responder".
