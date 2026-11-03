# PRD: Variações da mensagem de campanha com IA

Trilha: G
Início: 2026-11-03 16:45
Merge: (preencher no merge)

## Problema e objetivo
Campanha de mensagem livre ("Escrever agora") manda o mesmo texto para todos os leads. Em número não oficial (WAHA/Evolution), texto idêntico em massa aumenta o risco de bloqueio e soa repetitivo. Objetivo: a IA sugere versões alternativas da mensagem, o usuário revisa e aprova cada uma, e o disparo reparte as versões entre os leads.

## Estado atual (codebase e schema)
- `veltzy.blast_campaigns.message_body text`: texto livre único (`template_id` NULL). Disparo em `blast-dispatch`: resolve audiência, cria `blast_recipients` (UNIQUE `campaign_id, lead_id`), escalona pelo anti-ban (`computeBlastSchedule`) e enfileira na `message_queue` com `renderMessageBody(bodyText, lead)`.
- `veltzy.blast_recipients`: sem informação de qual texto o lead recebeu.
- Wizard de campanha: `src/components/campanhas/campaign-wizard.tsx`, 4 etapas (Destinatários, Mensagem, Configurações, Revisão).
- IA no Veltzy passa pelo gateway `ai-complete` do Hub via `HubClient` (`_shared/hub-client.ts`), por par `(product, feature)`. Feature sem linha no catálogo `public.ai_features` cai no modelo de fallback do gateway sem erro.
- Gates existentes: `companies.features.mkt_ativo_enabled` (campanhas) e `ai_msg_enabled` (IA que gera mensagem, custo).

## Requisitos funcionais
1. Na etapa Mensagem, modo "Escrever agora", botão "Gerar variações com IA" com seletor de quantidade de versões: 2 a 5, padrão 3. A mensagem original conta como uma versão.
2. A IA gera as versões que faltam. Cada versão aparece num card editável com Aprovar, Descartar e Gerar outra.
3. Toda versão precisa ser aprovada antes de seguir. "Continuar" só libera com todas aprovadas.
4. Cada versão preserva exatamente as variáveis da original (`{{nome}}`, `{{empresa}}` etc.): sem perder nenhuma e sem inventar outra. Validado no servidor (versão inválida da IA é descartada e pedida de novo) e no client (edição do usuário).
5. No disparo, as versões são repartidas de forma aleatória e equilibrada entre os destinatários (embaralha e divide em fatias iguais). Cada destinatário guarda o índice da versão que recebeu.
6. Revisão mostra quantas versões a campanha vai usar.
7. Intervalos, teto diário e janela de envio (anti-ban) não mudam.
8. Template aprovado (HSM / Cloud API) não tem variação.

## Repos envolvidos e contrato entre eles
- **Hub (B1):** migration no Central (colunas novas) + linha no catálogo `public.ai_features` para `(veltzy, campaign_message_variants)`.
- **Veltzy (B2-B4):** edge `campaign-variants`, ajuste no `blast-dispatch`, wizard. Dependem do B1 aplicado no staging.
- Contrato: `blast_campaigns.message_variants` (array de strings, `[0]` = original) e `blast_recipients.variant_index`; feature `campaign_message_variants` no gateway.

## Modelo de dados
| tabela | coluna | tipo | null | regra |
|---|---|---|---|---|
| veltzy.blast_campaigns | message_variants | jsonb | sim | array de strings, 1 a 5 itens; `[0]` = original; NULL = comportamento atual (`message_body`) |
| veltzy.blast_recipients | variant_index | smallint | sim | 0..4; NULL = campanha sem variação |
| public.ai_features | (linha) | | | `product='veltzy'`, `feature_key='campaign_message_variants'`, `kind='completion'` |

RLS: colunas novas em tabelas que já têm RLS por `company_id`; nenhuma policy nova.

## LGPD
Sem dado pessoal novo: as versões são texto de marketing escrito pela empresa, com variáveis ainda não resolvidas. A IA recebe só o texto da mensagem, nunca dado de lead.

## O que não entra
- Métricas por versão (taxa de resposta etc.). O índice é gravado agora para permitir isso depois.
- Variação de template HSM.
- Mudança no anti-ban.
- Variação em cadências e automações.

## Critérios de aceite
- Gerar 3 versões a partir de uma mensagem com `{{nome}}`: chegam 2 versões novas, todas com `{{nome}}` e sem variável nova.
- Não dá para avançar com versão pendente.
- Disparo para 10 leads com 3 versões: fatias 4/3/3 (ou permutação), índice gravado em cada destinatário, texto de cada mensagem = versão do índice renderizada para o lead.
- Campanha sem variação dispara exatamente como hoje.

## Decisões tomadas
- Ver SPEC.md, seção "Decisões tomadas".
