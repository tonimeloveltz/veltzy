# PRD - Copiloto por Regras (Dashboard)

> Fase SDD: PESQUISA. Este documento e um PRD, nao codigo de implementacao.
> Objetivo: o Copiloto da Dashboard passa a gerar dicas a partir dos dados do CRM
> usando regras/heuristicas calculadas no CLIENTE (sem IA), absorvendo as regras do
> card "Proximas Acoes", que sera removido depois que a portabilidade for validada.

## Decisoes ja tomadas (nao reabrir)

- Calculo no CLIENTE. Nada de nova Edge Function, nada de alterar a `ai-copilot`, nada de IA.
- Reaproveitar hooks que a dashboard ja busca: `useDashboardLeads`, `useDashboardDeals`,
  `useDashboardStages`, `useDashboardKpis`. NENHUMA query nova ao banco.
- As 5 regras de `buildActions` (next-actions-card.tsx) sao portadas para o Copiloto.
- "Proximas Acoes" e removido SOMENTE apos as regras funcionarem no Copiloto. Ultimo passo.
- Padrao: um builder puro (estilo `buildActions`/`detectBottlenecks`) em `src/lib/`
  (`buildCopilotTips`), consumido pelo `copilot-card.tsx` via `useMemo`.

---

## 1. Estado atual

### Copiloto hoje (`src/components/dashboard/copilot-card.tsx`)

- Nao calcula nada no cliente. Le notificacoes reais do banco via `useNotifications()`
  (`src/hooks/use-notifications.ts`, React Query, `refetchInterval: 30s`).
- Filtra no cliente: `n.type === 'copilot' && !n.is_read`, corta em 5 itens.
- Cada item e um botao que navega para `/inbox?lead=<leadId>` (se `action_data.leadId`
  existir) ou `/tarefas`. Lista vazia mostra "Nenhum alerta do copiloto. Tudo em ordem."
- Prioridade visual (`PriorityIcon`) vem do TITULO da notificacao: `'Tarefa vencida'` ou
  `'Reuniao em breve'` => icone vermelho; resto => azul.

**De onde vem `type='copilot'`:** da Edge Function `supabase/functions/ai-copilot/index.ts`
no modo batch padrao (chamada SEM `action: 'sales-pulse'`). Esse modo e 100% baseado em
regras/SQL, NAO chama IA. Insere notificacoes por empresa para 4 heuristicas:

1. Tarefas vencidas (`tasks.due_date < now`, status pending/in_progress).
2. Leads quentes (warm/hot/fire) sem mensagem ha 3+ dias.
3. Reunioes nas proximas 24h sem lembrete enviado.
4. Leads com `ai_score >= 70` sem tarefa pendente.

Tem deduplicacao (`hasDuplicate`, janela 24h). O modo `sales-pulse` (que chama LLM) existe
mas esta desligado (o hook `useSalesPulse` nao e usado por nenhum componente).

### Proximas Acoes hoje (`src/components/dashboard/next-actions-card.tsx`)

- Calcula TUDO no cliente via `buildActions(leads, stages, dealInfo)`.
- Consome `useDashboardLeads`, `useDashboardStages`, `useDashboardDeals` e deriva o negocio
  ativo por lead com `buildActiveDealInfo(deals)` (`src/lib/active-deal-info.ts`), que retorna
  `activeLeadIds` (Set) e `stageByLeadId` (Map do deal aberto mais recente).
- Gera ate 5 acoes, cada uma com contagem, e navega para `/pipeline<filter>`.
- Helpers de tempo locais: `isToday`, `hoursAgo(dateStr, h)`, `daysAgo(dateStr, d)`.

---

## 2. Regras / Heuristicas

Todas rodam no cliente sobre os dados ja buscados. "Ativo" = lead em `activeLeadIds`
(tem deal com status `open`); o estagio do lead vem de `stageByLeadId` (deal aberto mais
recente), nunca mais de `leads.stage_id`.

### 2.1 Regras PORTADAS de `buildActions` (thresholds HERDADOS, iguais aos de hoje)

| # | Dica | Condicao exata | Threshold | Prioridade | Texto exibido | Navega para |
|---|------|----------------|-----------|------------|---------------|-------------|
| 1 | Leads novos sem contato hoje | lead ativo E `isToday(created_at)` E `conversation_status === 'unread'` | hoje (mesmo dia civil) | media | "Leads novos sem contato hoje" | `/pipeline?action=new_no_contact` |
| 2 | Propostas vencendo esta semana | lead ativo E `stageByLeadId === proposalStage.id` E `daysAgo(updated_at, 7)` | 7 dias | media | "Propostas vencendo esta semana" | `/pipeline?stage=<proposalStageId>&stale=7` |
| 3 | Leads quentes sem contato ha 24h | lead ativo E `temperature in ('fire','hot')` E `hoursAgo(updated_at, 24)` | 24 horas | alta | "Leads quentes sem contato ha 24h" | `/pipeline?temperature=hot&stale=1` |
| 4 | Negociacoes paradas 3+ dias | lead ativo E `stageByLeadId === negotiationStage.id` E `daysAgo(updated_at, 3)` | 3 dias | alta | "Negociacoes paradas ha 3+ dias" | `/pipeline?stage=<negotiationStageId>&stale=3` |
| 5 | Leads aguardando retorno | lead ativo E `conversation_status === 'waiting_internal'` | (sem threshold de tempo) | baixa | "Leads aguardando retorno" | `/pipeline?conversation_status=waiting_internal` |

Notas herdadas:
- `proposalStage` = stage com slug `proposta` ou `proposal`; `negotiationStage` = `negociacao`
  ou `negotiation`. Se o pipeline nao tiver o stage, a regra correspondente conta 0 e nao aparece.
- Regra so aparece se `count > 0` (mesmo filtro de hoje: `.filter(item => item.count > 0)`).

### 2.2 Prioridade (PROPOSTA por mim, revisar)

`buildActions` nao tem prioridade; ele ordena pela ordem fixa do array. Proponho um campo
`priority: 'alta' | 'media' | 'baixa'` para ordenar a lista do Copiloto e escolher a cor do
icone (alta = vermelho, media = azul/laranja, baixa = neutro). Mapeamento proposto acima na
coluna Prioridade. Ordenacao proposta: alta, depois media, depois baixa; empate mantem a
ordem das regras (1..5). Tudo ajustavel.

### 2.3 Regras ADICIONAIS candidatas (OPCIONAIS, thresholds PROPOSTOS - revisar item a item)

Nao entram por padrao; ficam aqui para voce aprovar/rejeitar. Todas reusam dados ja buscados.

| # | Dica | Condicao exata | Threshold proposto | Prioridade | Texto | Navega |
|---|------|----------------|--------------------|------------|-------|--------|
| 6 | Deals de alto valor parados | deal `status==='open'` E `value >= X` E `daysAgo(updated_at, N)` | X = ticket alto a definir; N = 5 dias | alta | "Deals de alto valor parados" | `/pipeline?stale=5` |
| 7 | Alto score sem acao | lead ativo E `ai_score >= 70` (reusa `useDashboardLeads`) | 70 (mesmo do backend) | media | "Leads de alto score sem acao" | `/pipeline?score=70` |
| 8 | Taxa de conversao caindo | `kpis.conversionRate < kpis.prevConversionRate` por margem `>= M` p.p. | M = 10 p.p. | media | "Conversao caiu vs periodo anterior" | `/pipeline` |

Observacoes:
- Regra 7 se sobrepoe parcialmente a heuristica 4 do backend (alto score sem tarefa). Ver secao 3.
- Regra 8 usa `calculatePeriodChange` de `src/lib/dashboard-utils.ts`. So faz sentido quando ha
  periodo selecionado (`selectedDays` definido).
- Sugiro NAO incluir 6/7/8 nesta fase para manter paridade 1:1 com Proximas Acoes; decidir depois.

**Todos os thresholds ficam como constantes nomeadas no topo do builder** (ex:
`PROPOSAL_STALE_DAYS = 7`, `HOT_STALE_HOURS = 24`, `NEGOTIATION_STALE_DAYS = 3`), para revisao
e ajuste rapido, sem numeros magicos espalhados.

---

## 3. Coexistencia com as notificacoes `type='copilot'`

Hoje o card mostra SO as notificacoes do backend. Com as dicas calculadas, ha tres opcoes:

- **A) So dicas calculadas** (troca total): simples, previsivel, sem dupla fonte. Perde os
  alertas de tarefa/reuniao que so o backend gera (dependem de `tasks`/`task_reminders`, que
  o cliente da dashboard nao busca).
- **B) So notificacoes** (status quo): nao cumpre o objetivo da fase.
- **C) Combinado numa lista unica**: dicas calculadas + notificacoes nao lidas, ordenadas por
  prioridade. Mais completo, porem traz risco de duplicidade.

**Recomendacao: opcao A nesta fase, com nota de evolucao para C.**
Justificativa: o objetivo e portar Proximas Acoes para o Copiloto e depois remover aquele card.
As 5 regras portadas cobrem pipeline/leads/negociacao, que e o nucleo. As notificacoes de
tarefa vencida e reuniao proxima dependem de dados (`tasks`, `task_reminders`) que a dashboard
NAO busca hoje; incluir C exigiria decidir sobre `useNotifications` e abriria o risco de
duplicidade abaixo. Comecar por A entrega o objetivo com o menor risco e a menor superficie.
Registrar como follow-up (fora desta fase) a possibilidade de C.

**Risco de duplicata (mesmo escolhendo C no futuro):**
- "Lead quente sem contato" existe nas DUAS fontes com thresholds diferentes: backend usa
  3+ dias sem mensagem (heuristica 2 da Edge Function); a regra portada 3 usa 24h sobre
  `updated_at`. Se as duas aparecerem juntas, o usuario ve dois alertas para o mesmo problema
  com numeros diferentes.
- "Alto score sem acao" (regra proposta 7) x heuristica 4 do backend: mesma sobreposicao.

**Como evitar (se e quando for para C):**
- Deduplicar por `leadId`: se uma notificacao e uma dica apontam para o mesmo lead na mesma
  categoria, exibir so uma (preferir a de maior prioridade). As dicas calculadas hoje sao
  agregadas (contagem), nao por lead, entao a dedup exigiria mudar para dicas por lead ou uma
  chave de categoria. Isso e complexidade extra que reforca escolher A agora.
- Enquanto for A, nao ha duplicata porque as notificacoes deixam de ser exibidas no card
  (elas continuam existindo no sino/notification-center, sem mudanca).

---

## 4. Estrutura (arquivos)

### Criar

- `src/lib/copilot-tips.ts`
  - Exporta `interface CopilotTip { key: string; icon: LucideIcon; label: string; count: number;
    priority: 'alta' | 'media' | 'baixa'; navigateTo: string }` (nome dos campos a confirmar).
  - Exporta `buildCopilotTips(leads, stages, dealInfo, kpis?)` puro, sem hooks nem side effects,
    no estilo de `buildActions`/`detectBottlenecks`.
  - Reusa helpers de tempo (`isToday`, `hoursAgo`, `daysAgo`) e a resolucao de stage por slug.
    Sugestao: mover esses helpers de `next-actions-card.tsx` para ca (ou para um util de datas)
    para nao duplicar, ja que o card de origem sera removido.
  - Constantes de threshold nomeadas no topo (ver 2.3).
- `src/lib/copilot-tips.test.ts`
  - Testes unitarios do builder (mesma pratica de `active-deal-info.test.ts`). Casos: cada regra
    dispara/nao dispara no limite do threshold; lista vazia; ordenacao por prioridade.

### Modificar

- `src/components/dashboard/copilot-card.tsx`
  - Passar a receber `pipelineId?: string | null` como prop (igual aos outros cards de
    inteligencia), vindo de `dashboard.tsx`.
  - Consumir `useDashboardLeads(pipelineId)`, `useDashboardStages(pipelineId)`,
    `useDashboardDeals(pipelineId)` e, se as regras propostas 8 entrarem,
    `useDashboardKpis(selectedDays, pipelineId)`.
  - Calcular via `useMemo(() => buildCopilotTips(...), [leads, stages, deals, kpis])`, usando
    `buildActiveDealInfo(deals)` para o `dealInfo`.
  - Render: manter o visual atual (icone Bot, titulo "Copiloto"), trocar o conteudo para as
    dicas; clique navega para `tip.navigateTo` (`/pipeline...`). Estado vazio: "Tudo em dia".
  - Remover a dependencia de `useNotifications` no card (opcao A). O sino/notification-center
    continua usando `useNotifications` normalmente, sem mudanca.
  - Tratar loading (skeleton) como os outros cards fazem.

- `src/pages/dashboard.tsx`
  - Passar `pipelineId={selectedPipelineId}` para `<CopilotCard />` (linha atual ~344).
  - (Ultimo passo, ver secao 5) remover import e uso de `NextActionsCard`.

### Nao mexer

- `src/hooks/use-notifications.ts`, `notifications.service.ts`, `stores/notifications.store.ts`.
- `supabase/functions/ai-copilot/index.ts` e qualquer coisa de backend.
- `src/hooks/use-sales-pulse.ts` (continua codigo morto, nao ligar nem remover).

---

## 5. Ordem de implementacao

1. Criar `src/lib/copilot-tips.ts` com o builder puro e as constantes de threshold. Mover para ca
   os helpers `isToday`/`hoursAgo`/`daysAgo` e a resolucao de stage por slug.
2. Criar `src/lib/copilot-tips.test.ts` e validar as 5 regras portadas (limites de threshold).
3. Modificar `copilot-card.tsx`: aceitar `pipelineId`, consumir os hooks, `useMemo` do builder,
   render das dicas + estados de loading/vazio. Remover uso de `useNotifications` no card.
4. Modificar `dashboard.tsx`: passar `pipelineId={selectedPipelineId}` ao `<CopilotCard />`.
5. Validar no browser (ver criterios de aceite). Confirmar paridade das contagens entre o
   Copiloto e o card Proximas Acoes ainda presente (as duas fontes devem bater regra a regra).
6. **Ultimo passo, so apos validacao:** remover `NextActionsCard` de `dashboard.tsx` (import na
   linha ~21 e uso na linha ~338) e deletar `src/components/dashboard/next-actions-card.tsx`.
   Conferir que `buildActiveDealInfo`, `useDashboardLeads/Deals/Stages` seguem usados por outros
   cards (Bottleneck/Forecast) e NAO devem ser removidos.

---

## 6. O que NAO entra nesta fase

- IA / `sales-pulse`: nao ligar. O hook `useSalesPulse` continua codigo morto; nao sera
  ligado nem removido agora.
- Nenhuma alteracao na Edge Function `ai-copilot` (nem no modo batch, nem no sales-pulse).
- Nenhuma query nova, nenhuma migration, nenhuma mudanca de schema.
- Nenhuma coluna nova em tabela.
- Combinar dicas com notificacoes na mesma lista (opcao C) fica como follow-up, fora do escopo.
- Regras adicionais 6/7/8 ficam como candidatas para decisao posterior; o escopo minimo e a
  paridade 1:1 com as 5 regras de `buildActions`.

---

## 7. LGPD

- Esta fase NAO coleta dado pessoal novo.
- NAO cria campo, coluna ou tabela.
- NAO envia dado a terceiro e NAO faz transferencia internacional.
- As regras rodam no CLIENTE, sobre dados que o usuario logado ja acessa (leads, deals e
  stages ja carregados pela dashboard, respeitando o filtro por company_id e o filtro de
  vendedor ja aplicado nos hooks).
- Nenhuma base legal nova e necessaria. Nao ha alteracao no fluxo de dados pessoais; apenas
  uma nova apresentacao, no cliente, de dados que ja estavam em tela.

---

## 8. Criterios de aceite

Funcionais:
- O card Copiloto exibe as 5 dicas portadas quando as condicoes sao verdadeiras, com as
  contagens corretas, e some cada dica quando `count === 0`.
- Estado vazio (nenhuma dica) mostra a mensagem de "tudo em dia".
- Clique em cada dica navega para a rota `/pipeline...` com o filtro correto.
- As dicas respeitam o filtro de pipeline selecionado na dashboard (`pipelineId`).
- Ordenacao por prioridade aplicada (alta, media, baixa).

Paridade (antes da remocao):
- Com o card Proximas Acoes ainda visivel, as contagens de cada uma das 5 regras batem entre
  os dois cards para o mesmo pipeline e periodo.

Tecnico:
- `buildCopilotTips` e puro (sem hooks/side effects) e tem testes cobrindo os limites de
  threshold de cada regra.
- Nenhuma nova chamada de rede: verificar na aba Network que nenhuma query/endpoint novo
  aparece; o card reusa os dados ja buscados.
- `npm run lint` e `npm run build` passam. Sem `any`.

Teste no browser:
1. `npm run dev`, logar, abrir a Dashboard.
2. Conferir o card Copiloto renderizando as dicas e comparar contagem com Proximas Acoes.
3. Trocar o filtro de pipeline e conferir que as dicas se atualizam.
4. Clicar em uma dica e confirmar a navegacao/filtro no Pipeline.
5. Confirmar na aba Network que nenhuma requisicao nova foi disparada pelo card.
6. Simular condicao vazia (ou pipeline sem itens) e ver a mensagem de "tudo em dia".
