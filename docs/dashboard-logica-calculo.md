# Dashboard -- Logica de Calculo

**Ultima atualizacao:** 2026-06-09
**Referencia de codigo:** `src/services/dashboard.service.ts`, `src/pages/dashboard.tsx`

---

## 1. Tabela-resumo: cada card, fonte e filtro

| Card | Metrica | Tabela | Coluna usada | Filtro de periodo | Calculo |
|------|---------|--------|-------------|-------------------|---------|
| Taxa de Conversao | `conversionRate` | `leads` + `deals` | leads.created_at | Sim (created_at dos leads) | `deals won / total leads * 100` |
| Score Medio IA | `avgAiScore` | `leads` | ai_score | Sim (created_at) | `media de ai_score dos leads no periodo` |
| Deals Fechados | `dealsClosed` | `deals` | closed_at | Sim (closed_at) | `contagem de deals com status=won fechados no periodo` |
| Negocios (total) | `totalDeals` | `deals` | created_at / closed_at | Sim (varia por status) | `soma dos 5 status filtrados` |
| -- Aberto | `openCount` | `deals` | created_at | Sim | `status=open criados no periodo` |
| -- Fechado | `closedCount` | `deals` | closed_at | Sim | `status=won fechados no periodo` |
| -- Perdido | `lostCount` | `deals` | closed_at | Sim | `status=lost perdidos no periodo` |
| -- Sem dono | `pendingCount` | `deals` | created_at | Sim | `status=pending_assignment criados no periodo` |
| -- Arquivado | `archivedCount` | `deals` | created_at | Sim | `status=archived criados no periodo` |
| Ticket Medio | `avgTicket` | `deals` | value, closed_at | Sim | `soma valor won / quantidade won no periodo` |
| Valor Total | `totalValue` | `deals` | value | Sim | `soma de openValue + closedValue + lostValue` |
| -- Aberto | `openValue` | `deals` | value, created_at | Sim | `soma valor dos deals open no periodo` |
| -- Fechado | `closedValue` | `deals` | value, closed_at | Sim | `soma valor dos deals won no periodo` |
| -- Perdido | `lostValue` | `deals` | value, closed_at | Sim | `soma valor dos deals lost no periodo` |

### Cards secundarios (sem filtro de periodo dos KPIs)

| Card | Fonte | Filtro | Logica |
|------|-------|--------|--------|
| Proximas Acoes | `leads` (useDashboardLeads) | Pipeline selecionado, sem periodo | Regras fixas: leads novos sem contato hoje, propostas vencendo, leads quentes sem contato 24h, negociacoes paradas 3+ dias, aguardando retorno |
| Analise do Pipeline | `deals` (useDashboardDeals) | Pipeline selecionado, sem periodo | Detecta gargalos: stage com maior tempo medio de permanencia, stage com menor taxa de conversao historica (90 dias) |
| Previsao do Mes | `deals` (useDashboardDeals) | Pipeline selecionado, sem periodo | Para cada deal aberto (nao final), multiplica valor pela probabilidade de fechar (taxa historica do stage ou default). Compara com meta de revenue ativa. |
| Leads por Fonte | `leads` | Pipeline + periodo (created_at) | Conta leads por source_id no periodo |
| Equipe em Destaque | `deals` (useDashboardDeals) | Pipeline, periodo opcional | Agrupa deals por assigned_to, conta won, calcula conversao |
| Performance Vendedores | `deals` | Pipeline + periodo (created_at) | Por vendedor: total deals, deals won, taxa de conversao, tempo medio de resposta |
| Comparativo Mensal | `leads` + `deals` | Ultimos 3-6 meses | Leads por mes (created_at) + deals won por mes (created_at) |
| Evolucao Metricas | `leads` + `deals` | Ultimos N meses | Leads, conversao, deals won e valor por mes |
| Taxas Historicas | `deals` | Ultimos 90 dias, por pipeline | Por stage nao-final: quantos deals entraram vs quantos avancaram |

---

## 2. Regra central: filtro de periodo por tipo de deal

Quando o usuario seleciona um periodo (Hoje / Semana / Mes), o dashboard aplica filtros DIFERENTES dependendo do status do deal:

| Status do deal | Data usada no filtro | Logica |
|---------------|---------------------|--------|
| `open` | `created_at` | "Deals que entraram no funil neste periodo" |
| `won` | `closed_at` | "Deals que foram FECHADOS neste periodo" |
| `lost` | `closed_at` | "Deals que foram PERDIDOS neste periodo" |
| `pending_assignment` | `created_at` | "Deals sem dono que entraram neste periodo" |
| `archived` | `created_at` | "Deals arquivados que entraram neste periodo" |

**Por que a data e diferente?**

Um deal pode ter sido criado mes passado (created_at = maio) mas fechado hoje (closed_at = junho). Se filtrassemos "fechados do mes" por created_at, esse deal nao apareceria — o que e errado, porque ele FOI fechado este mes.

**Botao "Total":** remove TODOS os filtros de periodo. Mostra o estado completo: todos os deals da empresa (ou do pipeline selecionado).

**Fallback:** se `closed_at` for nulo (deals anteriores a migration 062), usa `created_at` como aproximacao.

---

## 3. Efeito pratico de trocar o periodo

### Exemplo concreto

Imagine 5 deals:

| Deal | created_at | closed_at | status | value |
|------|-----------|-----------|--------|-------|
| A | 01/mai | - | open | R$ 5.000 |
| B | 15/mai | 05/jun | won | R$ 10.000 |
| C | 20/mai | 08/jun | won | R$ 8.000 |
| D | 01/jun | - | open | R$ 3.000 |
| E | 03/jun | 07/jun | lost | R$ 6.000 |

**Filtro "Mes" (junho, ultimos 30 dias a partir de 09/jun):**

| Card | Valor | Explicacao |
|------|-------|-----------|
| Negocios (total) | 4 | D (open, criado jun) + B (won, fechado jun) + C (won, fechado jun) + E (lost, perdido jun) |
| Aberto | 1 | Apenas D (criado em junho). A foi criado em maio. |
| Fechado | 2 | B e C (fechados em junho, mesmo que criados em maio) |
| Perdido | 1 | E (perdido em junho) |
| Deals Fechados | 2 | = closedCount |
| Valor Total | R$ 24.000 | 3.000 + 10.000 + 8.000 + 6.000 - soma dos filtrados |
| Ticket Medio | R$ 9.000 | (10.000 + 8.000) / 2 won |

**Filtro "Total":**

| Card | Valor |
|------|-------|
| Negocios | 5 (todos) |
| Aberto | 2 (A + D) |
| Fechado | 2 (B + C) |
| Perdido | 1 (E) |
| Valor Total | R$ 32.000 |

**Observacao importante:** Deal A (criado em maio, ainda aberto) NAO aparece no filtro "Mes" porque `created_at` e de maio. Ele aparece apenas em "Total". Isso e intencional: o filtro de periodo para abertos responde "quantos negocios NOVOS entraram no periodo", nao "quantos estao abertos agora".

---

## 4. Relacao Dashboard x Kanban

### O que cada um mostra

| Aspecto | Dashboard | Kanban |
|---------|-----------|--------|
| Fonte de dados | `deals` (via getDashboardKpis) | `deals` (via getDealsForKanban) |
| Filtro de periodo | Sim (Hoje/Semana/Mes/Total) | Nao (mostra estado atual) |
| Filtro de status | Todos os status | `open`, `pending_assignment`, `won`, `lost` (exclui `archived`) |
| Filtro de pipeline | Pipeline selecionado ou todos | Pipeline ativo |
| Agrupamento | Por status (breakdown) | Por stage (colunas) |

### Quando os numeros batem

**Dashboard com "Total" + mesmo pipeline do kanban:**
- `Aberto` no dashboard = soma de deals open nas colunas nao-finais do kanban
- `Fechado` no dashboard = soma de deals na coluna "Fechado (Ganho)" do kanban
- `Perdido` no dashboard = soma de deals na coluna "Perdido" do kanban
- `Sem dono` no dashboard = deals na coluna especial "Sem dono" do kanban

**Dashboard com "Total" + todos os pipelines:**
- Os numeros serao MAIORES que qualquer kanban individual, porque agregam todos os pipelines

### Quando divergem

1. **Periodo != Total:** o dashboard filtra por periodo, o kanban nao. Entao o kanban pode mostrar mais deals (todos os open, incluindo antigos).

2. **Arquivados:** o kanban exclui `archived` (nao mostra). O dashboard com "Total" inclui arquivados no breakdown. Entao `totalDeals` no dashboard pode ser maior que a soma de cards no kanban.

3. **Pipeline diferente:** se o dashboard mostra "Todos os pipelines" e o kanban mostra "Pipeline Mkp", os numeros nao sao comparaveis.

### Regra pratica

> Para comparar dashboard com kanban: selecione "Total" no periodo E o mesmo pipeline. Os numeros de Aberto/Fechado/Perdido vao bater. A diferenca sera apenas os arquivados (dashboard mostra, kanban nao).

---

## 5. Deals deletados vs arquivados

### Deletados (DELETE permanente)

- **Somem de TUDO.** Nenhum card, nenhum historico, nenhum comparativo.
- Nao ha soft-delete. O `DELETE FROM deals` remove o registro da tabela.
- Se um deal era won e foi deletado, ele NAO conta mais em "Deals Fechados" nem em nenhuma metrica.
- A unica evidencia de que existiu e o activity_log (se a delecao foi feita via bulk delete que loga).
- **Consequencia pratica:** se voce testa movendo deals para ganho e depois deleta, os numeros "voltam" como se nunca tivessem existido.

### Arquivados (status = archived)

- **Dashboard:** aparecem no breakdown "Arquivado" (quando > 0) e contam no `totalDeals`.
- **Kanban:** NAO aparecem. O kanban filtra `status IN (open, pending_assignment, won, lost)`.
- **Metricas financeiras:** o valor de deals arquivados NAO entra em `totalValue` (que soma apenas open + won + lost).
- **Historico:** deals arquivados contam no comparativo mensal e taxas historicas (se passaram por stages antes de arquivar).

### Tabela de visibilidade

| Onde | Deletado | Arquivado | Open | Won | Lost | Pending |
|------|----------|-----------|------|-----|------|---------|
| Dashboard (cards) | Nao | Sim (breakdown) | Sim | Sim | Sim | Sim |
| Dashboard (valor) | Nao | Nao | Sim | Sim | Sim | Nao |
| Kanban | Nao | Nao | Sim | Sim | Sim | Sim (coluna especial) |
| Metas | Nao | Nao | - | Sim (revenue/count) | - | - |
| Comparativo mensal | Nao | Depende* | Sim | Sim | - | - |

*Deals arquivados que ja foram won nao mudam o comparativo (o status final e archived, nao won).

---

## 6. Edge cases

### Deal criado mes passado, fechado hoje

- **Abertos do Mes:** NAO aparece (created_at e do mes passado)
- **Fechados de Hoje:** SIM aparece (closed_at e de hoje)
- **Fechados do Mes:** SIM aparece (closed_at e deste mes)
- **Total:** aparece como Fechado

### Deal com closed_at nulo (pre-migration 062)

Deals que ja eram won/lost antes da migration receberam `closed_at = updated_at` como backfill. Isso e uma aproximacao — se o deal foi editado depois de fechado, o closed_at reflete a ultima edicao, nao o momento do fechamento. Para novos deals (pos-migration), o closed_at e preciso.

Se `closed_at` for nulo por algum motivo (deal won sem trigger), o fallback usa `created_at`.

### Multiplos deals do mesmo contato (lead)

Cada deal e uma entidade separada. Um lead pode ter 3 deals: cada um conta individualmente nas metricas. Se 2 forem won e 1 lost, o dashboard mostra 2 fechados e 1 perdido.

### Deal movido de pipeline

Se um deal e movido do Pipeline A para o Pipeline B:
- Com filtro "Pipeline A": o deal NAO aparece mais
- Com filtro "Pipeline B": o deal aparece
- Com filtro "Todos os pipelines": aparece normalmente
- A data de criacao nao muda. O pipeline_id muda.

### Deal reaberto (movido de stage final para stage nao-final)

O trigger 059 seta `status = 'open'` e `closed_at = NULL` quando um deal sai de um stage final. Ele volta a contar como "Aberto" e perde o registro de quando foi fechado anteriormente.

---

## 7. Formulas exatas

### Taxa de Conversao
```
conversionRate = (deals com status=won no periodo) / (total leads criados no periodo) * 100
```
Numerador: tabela `deals`, filtrado por `closed_at` no periodo
Denominador: tabela `leads`, filtrado por `created_at` no periodo

### Score Medio IA
```
avgAiScore = soma(leads.ai_score) / count(leads) no periodo
```
Fonte: tabela `leads`, filtrado por `created_at`

### Ticket Medio
```
avgTicket = soma(value dos deals won no periodo) / count(deals won no periodo)
```

### Previsao do Mes
```
Para cada deal open em stage nao-final:
  probabilidade = taxa historica do stage (ultimos 90 dias) OU default por posicao
  valor_ponderado = deal.value * (probabilidade / 100)
forecast_total = soma de todos os valores_ponderados
```
Defaults por posicao: posicao 0 = 5%, 1 = 15%, 2 = 40%, 3 = 70%

### Analise do Pipeline (gargalos)
```
Para cada stage nao-final:
  tempo_medio = media de (agora - deal.updated_at) dos deals open naquele stage
  taxa_conversao = deals que passaram por este stage / deals que avancaram
Alerta se: tempo_medio > 1 dia OU taxa < 80%
```
