# Diagnostico: sincronia do Dashboard sem F5

**Data:** 2026-07-16
**Branch:** `feature/fix-sync-dashboard`
**Tela:** `/dashboard`
**Status:** diagnostico. Nenhum codigo alterado.

**Sintoma relatado:** ao mudar um negocio (mover de fase, editar valor, ganhar/perder) sem atualizar a pagina, o card "Previsao do Mes" se atualiza sozinho, mas "Valor Total" nao. Suspeita da usuaria: outros cards tem o mesmo problema. **A suspeita esta correta, e a lista e maior do que parece.**

**Familia do bug:** mesma do fix do pipeline (`feature/fix-sync-pipeline`) - query que le um dado fora do alcance da invalidacao de cache emitida pela mutacao. Aqui o alcance falha de forma mais ampla, porque o dashboard tem um namespace de queryKeys proprio.

> Nota: `docs/DIAGNOSTICO-sync-pipeline.md` nao existe no repositorio (nem no historico do git). O paralelo abaixo foi reconstruido a partir do codigo em `develop` (a invalidacao de `['deals']` adicionada em `useUpdateLead`, e o novo `use-lead-detail.ts`).

---

## 1. Componente que renderiza o dashboard e seus cards

**Arquivo raiz:** `src/pages/dashboard.tsx` (367 linhas).

Ele nao delega tudo: os 6 KPIs do topo sao montados **inline dentro da propria pagina**, e os demais cards sao componentes em `src/components/dashboard/`.

| # | Card / metrica | Onde e montado |
|---|---|---|
| 1 | Taxa de Conversao | inline, `dashboard.tsx:228-243` |
| 2 | Score Medio IA | inline, `dashboard.tsx:246-261` |
| 3 | Deals Fechados | inline, `dashboard.tsx:264-279` |
| 4 | Negocios (+ breakdown Aberto/Fechado/Perdido/Sem dono/Arquivado) | inline, `dashboard.tsx:284-301` |
| 5 | Ticket Medio | inline, `dashboard.tsx:304-314` |
| 6 | **Valor Total** (+ breakdown Aberto/Fechado/Perdido) | inline, `dashboard.tsx:317-332` |
| 7 | Proximas Acoes | `<NextActionsCard>`, `dashboard.tsx:338` |
| 8 | Analise do Pipeline (gargalos) | `<BottleneckDetector>`, `dashboard.tsx:339` |
| 9 | **Previsao do Mes** | `<ForecastCard>`, `dashboard.tsx:340` |
| 10 | Copiloto de Vendas | `<CopilotCard>`, `dashboard.tsx:344` |
| 11 | Leads por Origem | `<LeadsBySourceChart>`, `dashboard.tsx:348` |
| 12 | Equipe em Destaque | `<TeamHighlightCard>`, `dashboard.tsx:349` |
| 13 | Performance de Vendedores | `<SellerPerformanceTable>`, `dashboard.tsx:353` |
| 14 | Comparativo Mensal | `<MonthlyComparisonGrid>`, `dashboard.tsx:356` |
| 15 | Evolucao das Metricas | `<MetricsLineChart>`, `dashboard.tsx:359` |

Os KPIs 1 a 6 **compartilham uma unica query**: `useDashboardKpis(selectedDays, selectedPipelineId)` (`dashboard.tsx:146`). Isso importa: eles ficam desatualizados ou atualizam **em bloco**, nunca individualmente.

---

## 2. De qual query cada card le o numero

Nenhum card do dashboard le de RPC de agregacao. `src/services/dashboard.service.ts` faz `select` em tabelas (`deals`, `leads`, `pipeline_stages`, `lead_sources`, `profiles`) e **agrega em JavaScript no client**. A unica `rpc()` do arquivo e `get_seller_avg_response_times` (`dashboard.service.ts:449`), usada so pela coluna "tempo medio de resposta" da tabela de vendedores.

| Card | queryKey exata | Fonte do numero |
|---|---|---|
| Taxa de Conversao | `['dashboard-kpis', companyId, days, pipelineId, sellerProfileId]` | select em `deals` + `leads`, agregado no client |
| Score Medio IA | `['dashboard-kpis', ...]` (mesma) | select em `leads.ai_score`, media no client |
| Deals Fechados | `['dashboard-kpis', ...]` (mesma) | select em `deals`, contagem no client |
| Negocios (+ breakdown) | `['dashboard-kpis', ...]` (mesma) | select em `deals`, contagem por status no client |
| Ticket Medio | `['dashboard-kpis', ...]` (mesma) | select em `deals.value`, media no client |
| **Valor Total (+ breakdown)** | `['dashboard-kpis', ...]` (mesma) | select em `deals.value`, soma no client |
| Proximas Acoes | `['dashboard-leads', ...]` + `['dashboard-stages', ...]` + `['deals', 'dashboard', ...]` | listas ja carregadas, regras no client |
| Analise do Pipeline | `['deals', 'dashboard', ...]` + `['dashboard-stages', ...]` + `['historical-conversion-rates', ...]` | lista de deals ja carregada, calculo no client |
| **Previsao do Mes** | `['deals', 'dashboard', ...]` + `['dashboard-stages', ...]` + `['historical-conversion-rates', ...]` + `['goals', companyId]` | `calculateForecast()` sobre a lista de deals ja carregada |
| Copiloto de Vendas | `['notifications', userId]` | select em `notifications` |
| Leads por Origem | `['leads-by-source', companyId, days, pipelineId, sellerProfileId]` | select em `leads` + `lead_sources`, contagem no client |
| Equipe em Destaque | `['deals', 'dashboard', ...]` + `['team-members', companyId]` | lista de deals ja carregada, agrupada no client |
| Performance de Vendedores | `['seller-performance', companyId, days, pipelineId, sellerProfileId]` | select em `deals` + `profiles`, agregado no client; **coluna de tempo de resposta vem da RPC `get_seller_avg_response_times`** |
| Comparativo Mensal | `['monthly-comparison-grid', companyId, months, pipelineId, sellerProfileId]` | select em `leads` + `deals`, agregado no client |
| Evolucao das Metricas | `['monthly-comparison-grid', ...]` (mesma do Comparativo) | idem |

Definicoes: `src/hooks/use-dashboard-metrics.ts` (as keys `dashboard-*`, `leads-by-source`, `seller-performance`, `monthly-comparison*`, `historical-conversion-rates`), `src/hooks/use-deals.ts:39-67` (`useDashboardDeals`), `src/hooks/use-dashboard-leads.ts`, `src/hooks/use-dashboard-stages.ts`.

---

## 3. Mutacoes que mudam esses dados, e o que cada uma invalida hoje

Todas em `src/hooks/use-deals.ts`:

| Mutacao | Linha | Acao do usuario | Invalida hoje |
|---|---|---|---|
| `useCreateDeal` | 80 | criar negocio | `['deals']`, `['contacts']` |
| `useUpdateDeal` | 102 | editar valor/campos | `['deals']` |
| `useMoveDealStage` | 118 | arrastar de fase | `['deals']` (onSettled) |
| `useUpdateDealValueAndMove` | 145 | mover + editar valor | `['deals']` (onSettled) |
| `useMoveDealToPipeline` | 172 | mover de pipeline | `['deals']` |
| `useCloseDeal` | 189 | **ganhar / perder** | `['deals']` |
| `useAssignDeal` | 210 | atribuir a vendedor | `['deals']`, `['notifications']` |

Em `src/hooks/use-leads.ts`:

| Mutacao | Linha | Invalida hoje |
|---|---|---|
| `useUpdateLead` | 45 | `['leads']`, `['contacts']`, `['deals']` (linha 59 - adicionada no fix do pipeline) |
| `useDeleteLead` | 68 | `['leads']` |

**As sete mutacoes de deal invalidam exatamente uma chave de leitura: `['deals']`.** Nenhuma delas menciona `dashboard-kpis`, `seller-performance`, `monthly-comparison-grid`, `leads-by-source`, `historical-conversion-rates`, `dashboard-leads` ou `dashboard-metrics`.

---

## 4. Causa raiz: por que "Previsao do Mes" atualiza e "Valor Total" nao

**Nome do mecanismo: divergencia de namespace de queryKey, coberta por invalidacao por prefixo em um caso e nao no outro. As metricas do dashboard vivem em um namespace (`dashboard-kpis`) que nenhuma mutacao de deal invalida.**

React Query invalida **por prefixo**: `invalidateQueries({ queryKey: ['deals'] })` casa com toda chave que *comece* com `'deals'`.

- **Previsao do Mes** le de `useDashboardDeals`, cuja key e `['deals', 'dashboard', companyId, ...]`. O primeiro elemento e `'deals'` -> a invalidacao de `['deals']` **casa por prefixo**, a query e marcada stale, refaz o fetch, e `calculateForecast()` recalcula sobre a lista nova. O card se atualiza sozinho.
- **Valor Total** le de `useDashboardKpis`, cuja key e `['dashboard-kpis', companyId, days, pipelineId, sellerProfileId]`. O primeiro elemento e `'dashboard-kpis'`, que **nao tem prefixo em comum com `['deals']`**. Nenhuma das sete mutacoes de deal a alcanca. A query permanece fresh e serve o valor antigo do cache.

Nao e um problema de `staleTime` proprio: **`staleTime` e agravante, nao a causa.** `useDashboardKpis` tem `staleTime: 5min` (`use-dashboard-metrics.ts:32`), entao mesmo ao **navegar do /pipeline de volta ao /dashboard** e remontar o componente, a query e considerada fresh e serve cache sem refetch. E exatamente por isso que o sintoma se manifesta como "so no F5": o F5 destroi o QueryClient inteiro, e so ai o numero volta certo.

**Dois paliativos ja existentes mascaram parcialmente o bug (e nao devem ser confundidos com o conserto):**

1. `refetchInterval: 60s` em todas as queries `dashboard-*` (`use-dashboard-metrics.ts:33`). Se a usuaria ficar parada no dashboard por ate um minuto, o numero eventualmente corrige. Nao e sincronia; e polling.
2. `useDashboardRealtime()` (`src/hooks/use-dashboard-realtime.ts`), chamado em `dashboard.tsx:147`. Ele escuta `postgres_changes` em `veltzy.deals` e invalida a lista completa de chaves, **incluindo `dashboard-kpis`**. E a tabela **esta** publicada no realtime (`supabase/migrations/061_deals_realtime.sql:7`).

**O ponto decisivo sobre o realtime:** `useDashboardRealtime` so existe **enquanto o /dashboard esta montado**. O fluxo real da usuaria e mover/fechar o negocio **no /pipeline**, onde esse hook nao roda e nenhum listener esta subscrito. A mutacao dispara `['deals']`, que atinge o cache global de deals; o evento realtime chega ao vazio (nenhum assinante). Ao navegar de volta ao dashboard, `['deals','dashboard']` esta invalidada e refaz o fetch (Previsao atualiza), mas `['dashboard-kpis']` esta fresh dentro do `staleTime` de 5 minutos e serve cache (Valor Total nao atualiza). **O sintoma reproduz exatamente.**

---

## 5. Mapa completo: cada card, atualiza sozinho ou so no F5

Cenario avaliado: usuaria muda um negocio (no /pipeline ou no proprio dashboard) e olha o dashboard sem F5, dentro da janela de 5 minutos.

| # | Card | Veredito | Por que |
|---|---|---|---|
| 1 | Taxa de Conversao | **so no F5** | le `['dashboard-kpis']`; nenhuma mutacao de deal alcanca |
| 2 | Score Medio IA | **so no F5** | le `['dashboard-kpis']`; idem (muda tambem via lead) |
| 3 | Deals Fechados | **so no F5** | le `['dashboard-kpis']`; idem |
| 4 | Negocios (+ breakdown) | **so no F5** | le `['dashboard-kpis']`; idem |
| 5 | Ticket Medio | **so no F5** | le `['dashboard-kpis']`; idem |
| 6 | **Valor Total (+ breakdown)** | **so no F5** | le `['dashboard-kpis']`; **caso relatado** |
| 7 | Proximas Acoes | **parcial** | a parte de deals le `['deals','dashboard']` e atualiza; a parte de leads le `['dashboard-leads']`, que `useUpdateLead` **nao** alcanca (invalida `['leads']`, nao `['dashboard-leads']`) |
| 8 | Analise do Pipeline | **parcial** | `['deals','dashboard']` atualiza; `['historical-conversion-rates']` (janela de 90 dias) fica stale - impacto baixo, e serie historica |
| 9 | **Previsao do Mes** | **atualiza sozinho** | le `['deals','dashboard']`, casa por prefixo com `['deals']`. **Unico card totalmente correto hoje** |
| 10 | Copiloto de Vendas | n/a | le `['notifications']`, tem `refetchInterval: 30s` e nao reflete valores de deal |
| 11 | Leads por Origem | **so no F5** | le `['leads-by-source']`; nenhuma mutacao alcanca (deal nem lead) |
| 12 | Equipe em Destaque | **atualiza sozinho** | le `['deals','dashboard']` + `['team-members']`; casa por prefixo |
| 13 | Performance de Vendedores | **so no F5** | le `['seller-performance']`; nenhuma mutacao alcanca |
| 14 | Comparativo Mensal | **so no F5** | le `['monthly-comparison-grid']`; nenhuma mutacao alcanca |
| 15 | Evolucao das Metricas | **so no F5** | mesma key do #14 |

**Resumo:** dos 15 cards, apenas 2 atualizam corretamente (Previsao do Mes e Equipe em Destaque - justamente os dois que leem do namespace `deals`). **9 cards estao quebrados, 2 parcialmente quebrados.** A suspeita da usuaria de que "nao e so o Valor Total" esta confirmada e subestimada: o Valor Total e a ponta visivel de um bloco de 6 KPIs que compartilham a mesma query quebrada.

---

## 6. Causa local do dashboard ou compartilhada com o pipeline?

**E o mesmo mecanismo do bug do pipeline, mas a manifestacao aqui e propria do dashboard e mais ampla.**

O que e compartilhado: a regra "a mutacao precisa invalidar toda queryKey que le o dado que ela mudou". No pipeline, a violacao era pontual - `useUpdateLead` mexia em dado exibido pelo card de deal e nao invalidava `['deals']`; o fix foi acrescentar uma linha (`use-leads.ts:59`).

O que e proprio do dashboard: aqui nao e uma chave esquecida, e **um namespace inteiro fora de alcance por design**. As queries do dashboard tem keys proprias (`dashboard-kpis`, `dashboard-metrics`, `dashboard-leads`, `leads-by-source`, `seller-performance`, `monthly-comparison`, `monthly-comparison-grid`, `historical-conversion-rates`, `pipeline-overview`) que **derivam de `deals` e `leads` no banco, mas nao carregam `'deals'` nem `'leads'` como prefixo**. Ou seja: sao dados de deal indexados fora do namespace `deals`. Nenhuma invalidacao existente pode alcanca-las por acidente.

Isso e agravado por dois fatores que o pipeline nao tem: o `staleTime` de 5 minutos (o pipeline usa 30s), e o fato de a mutacao acontecer em **outra rota**, onde o `useDashboardRealtime` - a unica coisa que hoje conhece a lista completa de chaves do dashboard - nao esta montado.

Curiosamente, **a lista correta de chaves ja existe no codigo**: `DASHBOARD_QUERY_KEYS` em `use-dashboard-realtime.ts:6-17`. Ela so esta no lugar errado - amarrada a um listener de socket que so vive dentro do /dashboard, em vez de amarrada as mutacoes que causam a mudanca.

---

## 7. Conserto minimo e correto

O conserto e **fazer as mutacoes de deal invalidarem as queryKeys de metricas do dashboard**, no lugar de depender de realtime + polling.

### Caminho A (recomendado): centralizar a lista de chaves e invalidar nas mutacoes

1. Extrair `DASHBOARD_QUERY_KEYS` de `use-dashboard-realtime.ts` para um modulo compartilhado (ex.: `src/lib/query-keys.ts`), como a fonte unica de verdade de "o que depende de deals/leads".
2. Criar um helper (ex.: `invalidateDealDependentQueries(queryClient)`) que invalida `['deals']` + todas as chaves de metricas.
3. Chamar esse helper no `onSuccess`/`onSettled` das sete mutacoes de `use-deals.ts` e nas de `use-leads.ts`.
4. `useDashboardRealtime` passa a consumir o mesmo helper, deixando de ser a unica fonte da lista.

**Vantagem:** conserta os 15 cards de uma vez, mantem as keys atuais e o cache granular por periodo/pipeline (importante: trocar o filtro de periodo continua servindo cache), e o realtime vira redundancia saudavel em vez de muleta.
**Custo:** as mutacoes passam a conhecer uma lista de chaves. Mitigado por ficar em um modulo unico e nomeado, nao espalhado por sete `onSuccess`.

### Caminho B: renomear as keys para o namespace `['deals', ...]`

Trocar `['dashboard-kpis', ...]` por `['deals', 'kpis', ...]` e assim por diante, para que a invalidacao existente de `['deals']` alcance tudo por prefixo.

**Vantagem:** zero manutencao de lista; a regra "invalidou deals, atualizou tudo que depende de deals" passa a valer estruturalmente.
**Custo / trade-off:** (a) metricas que dependem de `leads` e nao de `deals` (Score Medio IA, Leads por Origem) nao cabem bem no namespace `deals` - ficariam invalidadas por mutacao de deal sem necessidade, ou precisariam de um namespace paralelo `['leads', ...]`, gerando fetch duplo; (b) invalidacao mais grosseira: qualquer mutacao de deal passa a refazer o fetch de series historicas caras de 90 dias e do comparativo de 6 meses, que quase nunca mudam com um unico deal; (c) toca mais arquivos (todos os hooks + o realtime).

**Recomendacao: Caminho A**, com um refinamento - separar as chaves em dois grupos dentro do helper: as que refletem o estado atual (`dashboard-kpis`, `seller-performance`, `leads-by-source`, `dashboard-leads`), invalidadas sempre; e as series historicas (`historical-conversion-rates`, `monthly-comparison-grid`, `monthly-comparison`), que podem manter o polling atual, ja que um deal isolado nao move uma janela de 90 dias de forma perceptivel. Isso evita transformar cada drag & drop em uma rajada de queries pesadas.

Como efeito colateral do conserto, o `staleTime: 5min` deixa de ser um problema: uma query invalidada refaz o fetch independente do `staleTime`. Nao ha necessidade de baixa-lo (baixar `staleTime` seria justamente o paliativo a evitar - so encurta a janela do bug, nao o elimina).

### Sobre RPC

Explicito, conforme pedido: **consertar a invalidacao e 100% FRONT (client-side)**. Nao exige tocar RPC nem schema.

O unico ponto do dashboard que usa RPC e `get_seller_avg_response_times`, consumida dentro de `getSellerPerformance` (`dashboard.service.ts:449`). Ela ja e chamada **dentro da queryFn** da key `['seller-performance', ...]`. Invalidar essa key faz a queryFn rodar de novo, o que reexecuta a RPC e traz o valor novo. A RPC nao tem cache proprio no client - quem cacheia e o React Query, pela key. **A correcao da RPC e a mesma correcao de qualquer outro card: alcancar a queryKey.** O corpo da RPC nao muda.

---

## Confirmacao final

**Sim: isto e so front (cache/estado). Nenhuma migration, nenhuma mudanca de schema, nenhuma alteracao de RPC.**

Todos os dados corretos ja chegam do banco - o F5 prova isso: o mesmo select, a mesma RPC, o mesmo schema retornam o numero certo. O defeito esta inteiramente em **quando o React Query decide refazer o fetch**, e isso vive em `src/hooks/`. Os arquivos a tocar sao `use-deals.ts`, `use-leads.ts`, `use-dashboard-realtime.ts` e um novo modulo de query keys. Nada em `supabase/`.

Nao encontrei nenhuma razao para mexer no banco. Se durante a implementacao aparecer alguma - por exemplo, se algum numero continuar errado **depois do F5**, o que seria um bug de calculo e nao de cache - isso e outro problema, fora do escopo deste diagnostico, e sera levantado antes de qualquer alteracao.
