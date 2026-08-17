# PRD: Limpeza das colunas de negócio em `leads`

> Feature: `limpeza-colunas-negocio-em-leads`
> Status: Ondas 1 a 3 concluídas no staging. Produção pendente. Onda 4 destravada em 17/08/2026 (D5 decidida), não iniciada
> Data: 2026-08-13, estado atualizado em 17/08/2026
> Continuação de: `docs/features/deal-refactor/` ("Fase de limpeza") e `docs/features/historico-por-negocio/PRD.md:156` (que lista esta remoção como fora do escopo dele)

---

## 0. Estado

| Onda | Escopo | Código | Staging | Produção |
|---|---|---|---|---|
| 1 | `status`, `deal_value` | mergeada, PR #163 | aplicável (só código) | pendente de deploy do app |
| 2 | `stage_id` | mergeada | aplicável (só código) | pendente de deploy do app |
| 3 | drop das três colunas | migration no Hub | **aplicada 14/08/2026** (`20260814105318`), verificação 6.2 passou | **não aplicada** |
| 4 | `pipeline_id` | não iniciada, Spec pronta (`Spec-onda4.md`) | — | — |

**O que trava produção, e não é técnico:** a Onda 1 do `historico-por-negocio` (`20260812104156`, que cria `trg_log_deal_activity`) precisa ser promovida **antes** da Onda 3 chegar lá. Sem ela, remover os ramos de `log_lead_activity` deixa produção sem nenhum registro de mudança de etapa, e sem sintoma. Medido em 14/08/2026: o trigger existe no staging e não em produção. Verificação obrigatória em `Spec-onda3.md:6.1`, passo 3.

Hoje esse pré-requisito é **documentado, não verificado**: nada na migration impede aplicá-la na ordem errada. A guarda seria um `DO $$ ... RAISE EXCEPTION` abortando quando `trg_log_deal_activity` não existir no ambiente. Não escrita.

**~~O que trava a Onda 4~~ — destravado em 17/08/2026.** A D5 foi decidida: **o dashboard mede contatos, e o recorte por pipeline vem do negócio** (`deals.lead_id`), não de `leads.pipeline_id`. Ver 0.1 e seção 4.

### 0.1 D5 decidida, e o dashboard já saiu de `leads.pipeline_id`

Decisão da Leticia em 17/08/2026, tomada a partir da pergunta "como fica a contagem quando um contato tem negócios em pipelines diferentes". Resposta: usar só `deals.pipeline_id`, nunca `leads.pipeline_id`.

Implementada **fora das ondas**, em `src/services/dashboard.service.ts`, antes da Onda 4 e independente dela. As sete queries de contato que filtravam `leads.pipeline_id` agora cruzam com o conjunto de `deals.lead_id` daquele pipeline, montado por um helper paginado. Os onze filtros sobre `deals.pipeline_id` e os dois sobre `pipeline_stages.pipeline_id` não mudaram.

Duas consequências na tela, ambas aceitas:

1. **Contato com negócios em dois pipelines conta nos dois.** A soma por pipeline pode ultrapassar o total sem filtro. É o comportamento correto (ele está nos dois mesmo), mas os números deixam de fechar por soma. A seção 4 não previa isso: a previsão original era só a consequência 2.
2. **Contato sem negócio sai de toda métrica filtrada por pipeline.** São os 103 da seção 4, já previstos e aceitos ali. Sem filtro seguem contando.

O que sobra para a Onda 4 já não inclui o dashboard. ~~São dois leitores.~~

**Correção de 17/08/2026:** a versão anterior desta seção listava dois leitores (`leads.service.ts:102` e a guarda do `deletePipeline`). Estava errado. Aquela lista veio de um levantamento feito de dentro do dashboard, não de uma varredura do repo. A varredura completa encontrou **dezoito pontos de código, seis Edge Functions e quatro decisões de produto**, entre eles dois leitores que nenhuma Spec tinha visto: a contagem por pipeline do painel admin (`pipeline-list-manager.tsx:133`) e o pipeline no cabeçalho do inbox (`chat-header.tsx:29`). O inventário conferido está em `Spec-onda4.md`, seção 1.

**Precede a Onda 4:** a frente da truncagem por `max_rows` (achado da seção 6.1). Ela mexe nas mesmas queries e corrige número que já está errado na tela hoje.

**Onde isso aparece, mapeado em 17/08/2026.** O filtro é o `PipelineFilter` (`src/components/shared/pipeline-filter.tsx`), montado em `dashboard.tsx:151` e `deals.tsx:190`. Só o do dashboard exercita esta mudança: a tela de Negócios filtra negócio, que já filtrava por `deals.pipeline_id`. O select **não renderiza com menos de 2 pipelines ativos** (`pipeline-filter.tsx:17`).

Dos cinco pontos alterados, **dois são código morto**: `getConversionMetrics` (via `useDashboardMetrics`, zero consumidores) e `getMonthlyComparison` (via `MonthlyComparisonChart`, nunca montado). Candidatos de limpeza, não tocados. Os três vivos e o que muda na tela:

| Função | Onde aparece | Observação |
|---|---|---|
| `getLeadsBySource` | card "Leads por Origem" | único ponto vivo que responde ao seletor Hoje/Semana/Mês/**Total** |
| `getMonthlyComparisonGrid` | "Comparativo Mensal" e "Evolução das Métricas" | o mini-gráfico rotulado **"Negócios"** plota `dataKey="leads"`, ou seja contatos com rótulo errado; o "Conversão %" é `deals/leads`. Recorte próprio de 3/6/12 meses, **nunca all-time** |
| `getDashboardKpis` | "Score Médio IA", valor e badge de variação | `totalLeads` não é renderizado; o `conversionRate` do card grande é `closed/totalDeals`, não passa por contato. O badge só existe quando há período, então some em "Total" |

**Teste de aceite (PVO), com 2+ pipelines ativos:**

1. contato com negócios em dois pipelines aparece nos dois recortes;
2. contato sem negócio some ao escolher um pipeline e volta em "Todos os pipelines";
3. período "Total", sem filtro: somatório de "Leads por Origem" contra o total real de contatos; e `monthlyRange` em 12 meses, coluna do "Negócios" contra os contatos criados na janela.

**O item 3 só é falseável acima de 1000 contatos na janela.** Abaixo disso o corte do PostgREST não acontece e o verde não prova nada, com ou sem paginação: reportar como *não verificável neste ambiente*, nunca como aprovado.

Por isso a paginação tem cobertura própria em `src/services/dashboard.service.test.ts`, que não depende de volume nem de ambiente. O caso que sustenta o resto é o do servidor devolvendo **menos linhas que o `PAGE` pedido**: é o comportamento de um `max_rows` menor que 1000 e é a razão de `fetchAllRows` avançar por `rows.length` em vez de assumir o teto. Quando o helper mudar de casa na frente de 6.1, o teste vai junto.

**Pendências abertas** estão distribuídas nas três Specs: a de maior impacto para o usuário é a Fase vazia no modal (`Spec-onda2.md`, pendência 4), com causa isolada e correção provável de uma linha, adiada por decisão. Seguem também as três de erro engolido no caminho de IA (`Spec-onda1.md:6` e `Spec-onda2.md:6`) e o gateway do Hub com 500 no staging, diagnosticado até a fronteira e não além.

---

## 1. Problema

`veltzy.leads` guarda quatro colunas que descrevem negócio, não contato: `stage_id`, `status`, `deal_value` e `pipeline_id`. Desde o `deal-refactor`, quem move, vale e fecha é o negócio, e essas quatro viraram cópia mantida por trigger.

A cópia não é fiel. `mirror_deal_to_lead()` só espelha quando o contato tem **exatamente um** negócio:

```sql
IF deal_count > 1 THEN
  RETURN NEW;
END IF;
```

Com dois negócios ou mais, o espelho se cala e as colunas param no estado do último momento em que espelharam. Em produção isso são **23 contatos exibindo uma etapa que não é a do negócio aberto deles**. Não há sintoma: a tela mostra um valor plausível, só que errado.

**O que esta entrega resolve:** o negócio passa a ser fonte única de etapa, valor e status. As colunas espelhadas somem, junto com o trigger que as alimentava.

## 2. Estado atual, medido em 13/08/2026

Medições feitas nos dois ambientes. Staging é `veltz-group-staging`, produção é `veltz-group`, projetos separados.

| Medida | Staging | Produção |
|---|---|---|
| Contatos | 37 | 1479 |
| Com 2+ negócios | 14 (38%) | 39 (2,6%) |
| Com etapa divergente do negócio aberto | 7 | 23 (1,6%) |
| Sem negócio nenhum | 3 | 103 (7%) |
| Sem negócio e sem instância WhatsApp | 3 | 40 |

**Os 38% do staging não representam produção.** O PRD do `historico-por-negocio` usou esse número como dimensionamento, e ele é dado de teste inflado. Em produção a divergência é 1,6%. Isso rebaixa a urgência desta frente: ela não corrige corrupção em curso, ela remove fonte duplicada e destrava a Onda 1.5 do histórico.

### 2.1 `leads.status` não carrega informação

Distribuição em produção: `new` 1390, `deal` 42, `lost` 20, `open` 19, `qualifying` 8. **`archived`: zero.**

Dois fatos saem daí:

1. **94% dos contatos estão em `new`.** Olhando `sync_lead_status_from_stage()`, o status só sai de `new` quando o contato toca uma etapa **final**: etapa não-final com status `new` não altera nada. A coluna não acompanha o funil, ela registra "chegou ao fim" para 6% dos casos.
2. **O único valor que o código lê tem zero linhas.** `bulkArchive` (`leads.service.ts:245`) e `bulk-action-bar.tsx:38` são os únicos leitores com efeito, e ambos olham para `'archived'`. Zero linhas nos **dois** ambientes.

Os 15 leads em `new`/`qualifying` do staging e os 1398 de produção estão em valores que nenhum código consulta e que sequer têm equivalente em `DealStatus`.

### 2.2 O tráfego já migrou para negócios

`supabase inspect db index-stats` no staging:

| Índice | Coluna | Scans |
|---|---|---|
| `idx_leads_pipeline` | `leads.pipeline_id` | 5 |
| `idx_veltzy_leads_company_stage` | `leads.company_id, stage_id` | 95 |
| `idx_deals_lead_id` | `deals.lead_id` | 692 |
| `idx_deals_status` | `deals.status` | 470 |
| `idx_deals_assigned_to` | `deals.assigned_to` | 185 |

### 2.3 O tipo mente sobre o banco

`src/types/database.ts:229` declara `stage_id: string`. No banco (baseline do Hub, `veltzy.leads`) a coluna é **nullable**. Qualquer código que confie no tipo já está exposto a null hoje, e `new-contact-modal.tsx:147` contorna isso mandando `stage_id: ''`.

Há também `leads_pipeline_id_fkey ... ON DELETE SET NULL` numa coluna `NOT NULL` (baseline linha 6347). Só morderia num DELETE real de pipeline; o app faz soft delete (`pipelines.service.ts:113-115`), então é contradição latente. Some junto com a coluna.

### 2.4 A fonte de verdade é o repo do Hub

Vale aqui igual ao que o PRD do `historico-por-negocio` registrou em 2.3: `supabase/migrations/` do Veltzy é cópia histórica. `mirror_deal_to_lead` e a versão viva de `log_lead_activity` só existem no Hub. A Spec parte de lá.

Confirmado em 13/08/2026: `supabase migration list` mostra `20260812104156` (Onda 1 do histórico) aplicada no staging.

## 3. Decisões de arquitetura

**D1. O negócio é a fonte única.** Etapa, valor e status de negócio se leem de `veltzy.deals`. Nenhuma leitura nova em `leads` para esses três.

**D2. O negócio representativo é o aberto mais recente.** Onde um leitor precisava de um valor escalar e agora encontra N negócios, a escolha é `status = 'open'` mais recente por `created_at`. Não é convenção nova: é o que `active-deal-info.ts:26-30`, `use-export-leads.ts:42` e `run-automations/index.ts:86` já fazem.

**D3. `leads.status` é apagado, não mapeado.** `LeadStatus` e `DealStatus` são domínios diferentes: `new` e `qualifying` não têm destino, `deal` corresponde a `won`, `pending_assignment` não existe do lado do contato. Somado ao 2.1, não há o que preservar. O enum `veltzy.lead_status` cai junto.

**D4. A migration vai no repo do Hub.** O Veltzy consome o schema do Central, não é dono.

**D5. `pipeline_id` fica fora desta frente.** Ver seção 4. É a única das quatro cuja remoção muda número visível na tela, e a decisão é de produto. **Decidida em 17/08/2026: o dashboard mede contatos, e o pipeline do contato é o do negócio dele.** O dashboard já foi migrado fora das ondas; ver 0.1. A Onda 4 continua sendo o resto da remoção, agora sem bloqueio.

**D6. Arquivar contato é código morto e some.** ~~`bulkArchive` de contato vira `bulkArchiveDeals`.~~ Corrigido em 13/08/2026, ao rastrear os call sites para a Spec: `BulkActionBar` só é montada em `deals.tsx:251`, sempre com `mode="deals"`, e `contatos.tsx` não tem ações em lote. O ramo de arquivar contato é inalcançável pela interface, o que explica o `archived = 0` medido. Não há comportamento a migrar: o código é removido. Ver `Spec-onda1.md:1.1`.

**D7. O espelho sai por último.** `trg_mirror_deal_to_lead` e a trava multi-deal continuam de pé enquanto qualquer coluna espelhada existir. Eles saem na mesma migration que dropa as colunas, não antes.

## 4. `pipeline_id`: ~~o que falta decidir~~ decidido em 17/08/2026

> Esta seção fica como registro da análise. A pergunta do último parágrafo foi respondida: **contatos**, com o recorte vindo de `deals.lead_id`. Implementação e consequências em 0.1.


A análise inicial supunha que `pipeline_id` precisava ficar por causa da resolução de instância WhatsApp. Revisando o caminho completo, ela não sustenta isso:

- O `lead?.pipeline_id` de `resolve-instance.ts:39` é fallback redundante. O único chamador, `whatsapp-send/index.ts:129`, já passa `pipelineId` explícito, lido do mesmo contato na linha 87.
- Esse ramo só roda com `mode === 'sdr'`, ou seja `senderType === 'ai'` (linha 128). Para o SDR responder houve inbound, e o inbound carimba `whatsapp_instance_name`, que resolve na prioridade 1, antes do pipeline.

O que de fato segura a coluna é outra coisa: **103 contatos em produção não têm negócio**, e "contato puro" é fluxo vivo e intencional (`use-contacts.ts:60-64`). Hoje esses 103 são contados nos filtros por pipeline do dashboard (`dashboard.service.ts`, sete queries). Sem a coluna, eles saem dessas contagens e **números da tela mudam**.

A pergunta de produto: o dashboard mede contatos ou negócios? Se contatos, a substituição não é trocar de tabela, é subquery distinct por `deals.lead_id`, e os 103 somem do mesmo jeito por não terem negócio.

O ganho de remover, para registro: o cadastro de contato deixa de exigir pipeline. Hoje `new-contact-modal.tsx` bloqueia o cadastro quando a empresa não tem pipeline (`noPipeline`), o que é limitação artificial do `NOT NULL` sobre um contato que não tem negócio.

## 5. Ondas

**Onda 1. `status` e `deal_value`.** Nenhuma leitura com efeito, pelos dados de 2.1. Remoção do arquivamento de contato, que é código morto (D6); remoção dos campos do insert de `import-leads.service.ts:306-322`, cujo insert de negócio na linha 227 já grava tudo; remoção do fallback de `edit-lead-modal.tsx:107`; repontar `ai-copilot/index.ts:71-89` e `sdr-ai/index.ts:266`. Só código, sem migration. Detalhada em `Spec-onda1.md`, que descobriu de quebra um defeito silencioso de produção no copiloto (Spec 1.2.1).

**Onda 2. `stage_id`.** Corrige os 23 divergentes. Reescrita do `LEAD_WITH_DETAILS_SELECT` (`leads.service.ts:68-73`), que hoje resolve `pipeline_stages` pela FK da coluna; guard do `deleteStage` (`pipeline.service.ts:55-63`) passa a contar negócios; condição e `oldValue` de `run-automations/index.ts:65-80`; a etapa do export passa a vir do negócio. Detalhada em `Spec-onda2.md`.

~~`bulkMoveToPipeline` passa a mover o negócio.~~ Corrigido em 13/08/2026, ao escrever a Spec: a versão de contatos é **código inalcançável**, pelo mesmo padrão do `bulkArchive` da Onda 1. O modal usa `useBulkMoveDealsPipeline`, e `useBulkMovePipeline` não tem consumidor. Ela é removida, não migrada, e com isso some a decisão de produto sobre os 103 contatos sem negócio. O guard do `deletePipeline` também sai desta onda: ele conta por `pipeline_id`, então é Onda 4.

**Onda 3. Drop no Hub.** Colunas `stage_id`, `status`, `deal_value`; trigger `on_lead_stage_changed` e função `sync_lead_status_from_stage()`; enum `veltzy.lead_status`; índice `idx_veltzy_leads_company_stage`. Detalhada em `Spec-onda3.md`.

O inventário no banco (14/08/2026) mostrou que são **quatro** funções a tratar, não duas: além de `log_lead_activity` e `sync_lead_status_from_stage`, entram `mirror_deal_to_lead` (reescrita para espelhar só `pipeline_id`, já que ela não pode morrer antes da Onda 4) e `check_stage_has_leads`, um guard **no banco** que duplica o da aplicação e que nenhuma Spec anterior tinha visto. `trg_mirror_deal_to_lead` **não** é dropado aqui, ao contrário do que este PRD dizia: só na Onda 4.

A Onda 3 **absorve a Onda 1.5** do `historico-por-negocio`. O conteúdo daquela onda mudou de "condicionar os ramos por `pg_trigger_depth()`" para "remover os ramos", pelo achado da Onda 2, e virou pré-requisito técnico do drop em vez de limpeza opcional.

**Onda 4, sem data.** `pipeline_id`. ~~Condicionada à D5.~~ Destravada em 17/08/2026, com a D5 decidida. Detalhada em `Spec-onda4.md`: dezoito pontos de código, seis Edge Functions, quatro decisões de produto (D9 a D12) e a migration que dropa a coluna, o índice, a `mirror_deal_to_lead` e a trava multi-deal. ~~Depende da frente de `max_rows` (6.1) vir antes.~~ Corrigido em 17/08/2026: aquilo era prioridade, não pré-requisito. As duas frentes só se tocam na D10, e a Spec resolve ali. Em produção o que trava de verdade é a fila de quatro passos da Spec, seção 6.

A Onda 2 tem efeito colateral que interessa a outra frente, e ele é maior do que este PRD supunha. A Spec da Onda 1 do `historico-por-negocio` registra que os ramos de `log_lead_activity` não podem ser removidos porque `bulkMoveToPipeline` escreveria `leads.stage_id` direto e sem log. **Essa premissa já não vale**: a função é inalcançável hoje (ver acima). Depois da Onda 2, nada no código escreve `leads.stage_id`, e o único UPDATE que resta na coluna é o eco do próprio espelho, o que permite à Onda 1.5 remover os ramos em vez de distingui-los por `pg_trigger_depth()`. A decisão é da outra frente; aqui fica só o registro de que a justificativa mudou. Ver `Spec-onda2.md:2`.

## 6. Achados colaterais, fora desta frente

### 6.1 Truncagem silenciosa por `max_rows` (frente própria, prioridade acima da Onda 4)

`supabase/config.toml:18` define `max_rows = 1000`. As queries de negócio do `dashboard.service.ts` não paginam: a do `getDashboardKpis` puxa **todos** os negócios da empresa sem `range`. Passando de mil, o PostgREST corta a resposta sem erro e os KPIs saem truncados, em silêncio. Produção tem 1479 contatos, então a contagem de negócios provavelmente já ultrapassou o corte: **é número errado na tela hoje.**

**E não é só o dashboard.** Achado em 17/08/2026, ao varrer o repo para a Onda 4: `useContacts` busca os contatos com `limit: 0` (`use-contacts.ts:35`), que pula o `range` e cai direto no teto. Com 1479 contatos em produção, **a página de Contatos já está truncada em 1000 hoje**, sem erro e sem sintoma. É o pior caso conhecido desta frente, porque é lista, não métrica: o usuário procura um contato que existe e não acha.

Vale para `leads` também, não só `deals`: `getDashboardKpis` sem `days` é all-time, e `getLeadsBySource` e os dois `getMonthlyComparison*` já buscavam linhas sem `range`.

O `config.toml` é o ambiente local. O default hospedado também é 1000, e o valor real do projeto se confirma no painel; até lá, tratar como 1000. Qualquer correção deve avançar pelo tamanho da página recebida em vez de assumir o número, para não depender disso.

Vem **antes** da Onda 4: a Onda 4 é dívida, esta afeta produção agora. PRD e Spec próprios.

**Estado intermediário, e o que ele faz aparecer na tela:** a mudança de 0.1 já paginou os sete acessos a `leads` do `dashboard.service.ts` (era obrigatório: o recorte por pipeline passou a depender do conjunto estar completo). O lado de `deals` continua cortado. Ou seja, hoje o dashboard conta contatos por inteiro e negócios até mil. A taxa de conversão pode **mudar de valor** por causa disso, sem que nenhum dos dois lados esteja correto ainda. No teste de aceite de 0.1 isso não conta como falha; a verificação da taxa pertence a esta frente, não àquela.

### 6.2 Contatos que conversaram e não têm negócio

Produção tem 103 contatos sem negócio, dos quais só 40 sem instância WhatsApp. Sobram **63 contatos que conversaram e não têm negócio nenhum**, o que não deveria acontecer, já que o inbound chama `createDealForLead`. A hipótese é que sejam anteriores à migration 054 e tenham ficado fora do backfill. Na prática aparecem no inbox e não no pipeline.

Não bloqueia esta frente e não é corrigido por ela. Fica registrado como bug de dados próprio.

## 7. LGPD

**Não há tratamento novo de dado pessoal.** As quatro colunas são de negócio: etapa, pipeline, valor e status. Nenhuma delas é dado pessoal do titular, e nada é coletado, compartilhado ou retido a mais.

O efeito é o oposto: a entrega **reduz** duplicação de dado sobre o titular, o que atende o princípio de necessidade (art. 6º, III). O histórico de quem esteve em qual etapa continua em `activity_logs`, sem alteração de retenção, e a tensão já registrada na D8 do `historico-por-negocio` não muda de forma.

Ponto de atenção para a Spec: o drop da Onda 3 é irreversível e leva junto o estado de 1479 contatos. Backup da tabela antes do drop, com prazo de descarte definido, para que o backup não vire retenção indefinida por acidente.

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Drop rodado antes de o código parar de ler as colunas | Alto | A Onda 3 só entra depois de 1 e 2 validadas em staging. A ordem é código primeiro, banco depois |
| ~~`bulkMoveToPipeline` sem tratamento para contato sem negócio~~ | Eliminado | A função é inalcançável (13/08/2026). Não há operação que mova contato de pipeline em lote |
| Regra de automação com condição em `stage_id` deixa de casar em silêncio | Médio | `evaluateCondition` lê o campo por nome. A Spec da Onda 2 enriquece o objeto com o stage do negócio antes de avaliar |
| Spec escrita a partir de `supabase/migrations/` do Veltzy | Alto | A Spec parte do Hub (2.4). Os arquivos daqui são cópia histórica |
| Migration aplicada sem policy ou sem grant | Alto | Precedente documentado em `docs/features/cadastro-produtos/Spec-onda1.md:1.1` |
| Onda 3 aplicada em produção antes de a Onda 1 do histórico ser promovida | **Alto** | Medido em 14/08/2026: `trg_log_deal_activity` existe no staging e **não** em produção. Sem ele, tirar os ramos de `log_lead_activity` deixa produção sem nenhum registro de mudança de etapa, e sem sintoma. Verificação obrigatória em `Spec-onda3.md:6.1`, passo 3 |
| Função plpgsql com referência órfã depois do drop | **Alto** | plpgsql não valida coluna até executar, então o `DROP COLUMN` passa e o próximo `UPDATE` em `leads` quebra o inbox inteiro. As quatro funções são tratadas antes do drop, e a verificação pós-drop começa por um `UPDATE` real (`Spec-onda3.md:6.2`) |

## 9. Métricas de sucesso

- Contatos com etapa divergente do negócio: hoje 23 em produção, meta 0 por construção, já que resta uma fonte só.
- Pontos de acesso a `leads.stage_id`, `leads.status` e `leads.deal_value` em `src/` e `supabase/functions/`: meta 0, verificável por grep. O inventário nominal desses pontos é entregável da Spec, não deste PRD.
- Onda 1.5 do `historico-por-negocio`: hoje bloqueada por `bulkMoveToPipeline`, meta destravada.
- Nenhuma regressão em etapa, valor e status exibidos no kanban, em Negócios e no export.

## 10. Fora de escopo

`pipeline_id` (D5, Onda 4). Os 63 contatos sem negócio da seção 6. Renomear "lead" para "contato", que segue como Fase 3 do `deal-refactor`. A Onda 1.5 do histórico, que esta frente destrava mas não executa. A unidade de medida do dashboard, contatos ou negócios, que só vira decisão se a Onda 4 for aprovada.
