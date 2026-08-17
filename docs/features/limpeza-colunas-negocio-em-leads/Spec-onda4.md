# Spec: Limpeza das colunas de negócio em `leads`, Onda 4

> Feature: `limpeza-colunas-negocio-em-leads` / Onda 4 (`pipeline_id`, a última coluna)
> PRD: `docs/features/limpeza-colunas-negocio-em-leads/PRD.md`
> Ondas anteriores: `Spec-onda1.md` (mergeada 13/08), `Spec-onda2.md` (mergeada 14/08), `Spec-onda3.md` (aplicada no staging 14/08)
> Status: Pronta para implementação. **Código de app E migration.** Produção bloqueada pela fila da seção 6.
> Data: 2026-08-17
> Fonte: varredura de `src/` e `supabase/functions/` em 17/08/2026, mais o repo do Hub

---

## 0. Resumo

`veltzy.leads` perde `pipeline_id`, e com ela morrem a `mirror_deal_to_lead`, a trava multi-deal e o índice `idx_leads_pipeline`. Depois desta onda, o pipeline pertence exclusivamente ao negócio.

**Esta onda é maior que as anteriores.** As Ondas 1 e 2 removiam leitura de colunas que ninguém precisava; aqui há dezoito pontos de código, seis Edge Functions e quatro decisões de produto. A diferença é que `pipeline_id` tem uso legítimo: ele responde "de qual funil é este contato", e essa pergunta não some junto com a coluna, ela muda de fonte.

**O PRD subdimensionava o escopo.** A seção 0.1 dizia que sobravam dois leitores. Isso vinha de um levantamento feito de dentro do dashboard, não de uma varredura. Corrigido aqui e no PRD.

Duas coisas facilitam mais do que parece:

- **A D5 já foi decidida e implementada** (PRD 0.1). O dashboard saiu de `leads.pipeline_id` em 17/08, fora das ondas. Os sete filtros que a Onda 3 listava como bloqueio não existem mais.
- **Boa parte dos escritores já resolve o pipeline por conta própria** antes de gravar. O inbound tem `resolved.pipelineId`, o import grava o pipeline no negócio na mesma passada, o instagram-webhook idem. Nesses casos o trabalho é apagar uma linha, não achar substituto.

## 1. Inventário, medido em 17/08/2026

### 1.1 Escritores de `leads.pipeline_id`

| Onde | O quê | Substituto |
|---|---|---|
| `src/services/leads.service.ts:169` | `createLead` grava a coluna | apagar o campo do insert (4.1) |
| `src/components/contacts/new-contact-modal.tsx:73,143,152` | resolve pipeline default só para satisfazer o `NOT NULL`, e bloqueia o cadastro sem pipeline | apagar os três (4.2) |
| `src/services/import-leads.service.ts:71,310` | grava no contato | apagar; `:221` já grava no negócio |
| `src/lib/csv-parser.ts:95,142` | mapeia a coluna "Pipeline" do CSV | **fica** (4.3) |
| `supabase/functions/_shared/lead-inbound-handler.ts:374,450` | insert do lead novo | apagar o campo; `resolved.pipelineId` continua indo para o negócio |
| `supabase/functions/instagram-webhook/index.ts:74,86` | insert do lead | apagar o campo; `:83-90` já cria o negócio com o pipeline |

### 1.2 Leitores de `leads.pipeline_id`

| Onde | O quê | Destino |
|---|---|---|
| `src/services/leads.service.ts:71` | embed `pipelines:pipeline_id(*)` no `LEAD_WITH_DETAILS_SELECT` | remover (4.4) |
| `src/services/leads.service.ts:102` | `LeadFilters.pipelineId`, com **dois consumidores vivos** | remover, recorte vai para os chamadores (4.4) |
| `src/lib/export-leads.ts:32,132` | coluna "Pipeline" do export, via o embed acima | repor pelo negócio (4.6) |
| `src/components/pipeline/edit-lead-modal.tsx:77` | fallback `lead?.pipeline_id` na busca de etapas | deixar só o negócio (4.7) |
| `src/services/pipelines.service.ts:105-107` | guarda do `deletePipeline` | reescrever, D11 |
| `src/components/admin/pipeline-list-manager.tsx:133-141` | contagem por pipeline no painel admin | reescrever, D10 |
| `src/components/inbox/chat-header.tsx:29` | nome do pipeline no cabeçalho do chat | reescrever, D9 |
| `src/components/pipeline/import-steps/preview-step.tsx:50-51` | preview do import | **fica** (4.3) |
| `supabase/functions/_shared/resolve-instance.ts:28,38` | fallback `lead?.pipeline_id` | remover (4.5) |
| `supabase/functions/_shared/lead-inbound-handler.ts:280-291,316` | escolhe SDR v1 ou v2 pelo `agent_profile` do pipeline | usar `resolved.pipelineId`, que já está em escopo (4.5) |
| `supabase/functions/sdr-ai/index.ts:266,358,374` | contexto de scoring e template de transfer | receber `pipelineId` no payload (4.5) |
| `supabase/functions/sdr-engine/index.ts:49,58-60` | acha o `agent_profile`; recusa com 400 sem pipeline | derivar do negócio, D12 |
| `supabase/functions/sdr-engine/tools/escalate-to-human.ts:73,98-102` | template de transferência | usar o pipeline já resolvido (4.5) |
| `supabase/functions/whatsapp-send/index.ts:87,129` | passa `lead.pipeline_id` para o `resolveInstanceName` | derivar do negócio (4.5) |

**Tipos:** `src/types/database.ts:221` (`Lead.pipeline_id`) sai, **e o campo `pipelines` de `LeadWithDetails` sai junto** (4.6 explica por que isso não é detalhe). `:264` (`CreateLeadInput.pipeline_id`) **fica, virando opcional** (`pipeline_id?: string`), e a seção 4.1 explica por quê.

**Falsos positivos da busca textual**, não tocar: `sdr-v2-metrics.service.ts` (é `sdr_conversations.pipeline_id`), `pipeline-access.service.ts`, `pipeline-routing-rules.service.ts`, `source-integrations.service.ts`, `agent-profile.service.ts`, `pipeline.service.ts`, `conversation-state.ts`, `resolve-pipeline-by-origin.ts`. Todas operam sobre outras tabelas com coluna homônima, que é a mesma armadilha que a Onda 3 registrou para `stage_id`.

### 1.3 Banco, do repo do Hub

| Objeto | Onde | Destino |
|---|---|---|
| `mirror_deal_to_lead()` | reescrita na Onda 3, `20260814105318` seção 4 | **drop** (5.2) |
| `trg_mirror_deal_to_lead` em `veltzy.deals` | idem | **drop** (5.2) |
| `idx_leads_pipeline` | `baseline.sql:5175` | drop, junto com a coluna |
| `leads_pipeline_id_fkey` | `baseline.sql:6347` | cai com a coluna |
| coluna `pipeline_id uuid NOT NULL` | `baseline.sql:3532` | drop (5.3) |

Nenhuma view, policy ou outra função referencia `leads.pipeline_id`. A verificação disso é obrigatória antes de aplicar (7.1, passo 2), porque o inventário é de 17/08 e a Onda 3 provou que o banco tinha objeto que nenhuma Spec conhecia.

**A FK é `ON DELETE SET NULL` numa coluna `NOT NULL`.** Apagar um pipeline de verdade daria erro em vez de limpar a referência. Nunca disparou porque `deletePipeline` só desativa, nunca deleta. Some com a coluna, e isso é ganho colateral, não risco.

## 2. A regra única: qual negócio representa o contato

Três das quatro decisões abaixo precisam responder "qual pipeline é o deste contato" quando ele tem vários negócios. **Essa regra já existe no repo** e foi estabelecida na Onda 1, em `src/lib/active-deal-info.ts`:

> negócio **aberto** (`status = 'open'`) mais recente por `created_at`. Contato sem negócio aberto fica de fora.

**R1: reutilizar essa regra, não inventar outra.** Quem precisar do pipeline representativo do contato usa o mesmo critério, e o front reutiliza `buildActiveDealInfo` onde já tiver os negócios carregados.

Duas consequências, e as duas são coerentes com a D5:

- contato com negócios em dois pipelines resolve para **um** quando a pergunta exige resposta única (cabeçalho do chat, SDR). Isso é diferente do dashboard, onde ele conta nos dois, e a diferença é intencional: contagem admite pertencer a vários, roteamento não;
- contato **sem negócio aberto** não tem pipeline. Onde isso for um destino obrigatório, o caminho precisa falhar explicitamente, nunca escolher um pipeline arbitrário. A trava multi-deal existia justamente por preferir silêncio a valor arbitrário, e a regra que a substitui herda esse princípio.

## 3. Decisões de produto

**D9. O cabeçalho do chat mostra o pipeline do negócio representativo.** `chat-header.tsx:29` hoje lê `lead.pipeline_id`. Passa a usar R1. Sem negócio aberto, **oculta o badge** em vez de mostrar rótulo vazio. O componente já oculta quando a empresa tem um pipeline só (`pipelines.length > 1`), então o caminho de "não mostrar" já existe e está estilizado.

**D10. A contagem do painel admin passa a contar negócios, e o rótulo muda junto.** `pipeline-list-manager.tsx:133` conta contatos por `leads.pipeline_id` e escreve "leads". Passa a contar `deals` por `pipeline_id`. **O texto na tela tem que mudar de "leads" para "negócios"**, senão o número muda de significado sem avisar quem lê. Mesmo tratamento que a Onda 2 deu ao guard do `deleteStage`.

**A contagem tem que ser feita no servidor**, um `count: 'exact', head: true` por pipeline, e não trazendo as linhas para contar no cliente. A implementação atual traz todas as linhas de `leads` e agrupa em JS, o que já a deixa sujeita ao teto do PostgREST: com mais de mil negócios a contagem sairia errada, em silêncio, exatamente o problema da frente de 6.1 do PRD. Trocar a tabela sem trocar a técnica levaria o defeito junto. É o único ponto desta onda que encosta naquela frente.

**D11. A guarda do `deletePipeline` conta negócios e filtra por empresa.** Duas correções na mesma passada:

- contar `deals` em vez de `leads`, por coerência com a D10 e com a Onda 2;
- acrescentar `.eq('company_id', companyId)`, que hoje falta. Viola a regra de ouro do CLAUDE.md. O RLS provavelmente salva, mas o código não filtra, e a regra é que o RLS é a última linha, não a única.

A mensagem passa a ser `'Mova os negócios para outro pipeline antes de desativar'`, **com acento**. A Onda 3 registrou esse mesmo cuidado: copy que o usuário lê não herda a ausência de acentuação destes documentos.

**D12. O `sdr-engine` deriva o pipeline do negócio, e continua recusando quando não houver.** Hoje `index.ts:58-60` faz `pipelineId ?? lead.pipeline_id` e devolve 400 `'Lead sem pipeline_id'` se não achar. Passa a ser `pipelineId ?? <R1 sobre os negócios do lead>`, com o mesmo 400 no fim, e a mensagem vira `'Lead sem negócio: nao ha pipeline para resolver o agent_profile'`.

**Manter a recusa é decisão, não omissão.** Sem pipeline não há `agent_profile`, e escolher um pipeline arbitrário faria a IA responder com a persona de outro funil. Falhar é o comportamento correto. Na prática o caminho quase nunca dispara: quem chama o `sdr-engine` é o inbound, que já passa `pipelineId` explícito.

## 4. Mudanças de código

### 4.1 `createLead` para de gravar, mas o parâmetro fica

`leads.service.ts:169`: apagar `pipeline_id: normalized.pipeline_id` do insert, e apagar o comentário de `:155-158` que explica por que ele estava lá.

**`CreateLeadInput.pipeline_id` NÃO sai** (`types/database.ts:264`), e isso não é esquecimento. Ele ainda é lido em `leads.service.ts:152`, para resolver a instância de WhatsApp:

```ts
normalized.whatsapp_instance_name = await resolveWhatsAppInstance(
  companyId, normalized.assigned_to, normalized.pipeline_id,
)
```

O parâmetro deixa de ser "a coluna que vai ser gravada" e passa a ser "o pipeline em cujo contexto este contato está sendo criado", que é informação de chamada, não de persistência. Ele já é opcional em `resolveWhatsAppInstance` (`leads.service.ts:20`) e a cadeia degrada sozinha para a primeira instância conectada da empresa quando vem vazio.

**Renomear o campo fica fora**: o valor continua sendo um id de pipeline e o nome continua certo. Trocar o nome mexeria em todos os chamadores por ganho cosmético, numa entrega que já é grande.

### 4.2 O modal de contato deixa de exigir pipeline

Este é o ganho de produto declarado no PRD (seção 4, último parágrafo). Em `new-contact-modal.tsx`:

- apagar `resolvedPipelineId` (`:72-76`) e o comentário que cita a Fase 4;
- apagar `pipeline_id: resolvedPipelineId` do `CreateLeadInput` (`:143`);
- apagar `noPipeline` (`:152`), o aviso que ele monta (`:167`) e a condição no `disabled` do submit (`:283`).

Empresa sem pipeline nenhum passa a conseguir cadastrar contato. Hoje o botão fica desabilitado, o que é limitação artificial: contato puro não tem negócio, então não tem por que depender de funil.

Consequência a registrar: o contato criado por aí nasce sem `whatsapp_instance_name` vindo do pipeline. Cai no fallback da instância conectada, que é o comportamento que já vale hoje para empresa cujo pipeline não tem `sdr_instance_name`.

Atualizar também o comentário de `use-contacts.ts:60-64`, que ainda diz "pipeline_id e preenchido pelo modal (coluna NOT NULL ate a Fase 4)".

### 4.3 O import mantém a coluna "Pipeline" do CSV

`import-leads.service.ts`: apagar `pipeline_id: defaultPipelineId` (`:71`) e `record.pipeline_id = row.pipeline_id` (`:310`).

**Todo o resto fica.** A coluna "Pipeline" do CSV continua existindo, continua sendo resolvida por nome (`:106-109`), validada (`:161`), e continua alimentando o insert do negócio em `:221`, que já grava `pipeline_id: row.pipeline_id`. O mapeamento em `csv-parser.ts` e o preview em `preview-step.tsx` também ficam: eles descrevem a linha do CSV, não a coluna do banco.

`:93-95` também fica: ele usa o pipeline para resolver o estágio por nome, que é do negócio.

### 4.4 Os dois leitores do `leads.service`

`:71`: remover `pipelines:pipeline_id(*)` do `LEAD_WITH_DETAILS_SELECT`. A Spec da Onda 2 já tinha marcado esse embed como Onda 4 (`Spec-onda2.md:31`). Conferir os consumidores de `LeadWithDetails` que acessam `.pipelines` depois de remover; `tsc` pega, porque o campo sai da interface junto.

`:102` e o campo `pipelineId` de `LeadFilters` (`:78`): remover.

**Correção de 17/08/2026, achado da codificadora ao varrer antes de implementar.** A versão anterior desta seção dizia que o filtro era alcançável só por código morto. Errado, e pelo mesmo motivo das outras correções desta frente: eu parei no primeiro consumidor em vez de varrer. São **três** consumidores, dois vivos:

| Consumidor | Vivo? |
|---|---|
| `use-leads.ts:28` → `FollowUpTips` | morto, não é montado |
| `use-export-leads.ts:27` → `useExportLeads` | **vivo**: `contatos.tsx:38`, `reports-tab.tsx:7`, `pipeline-header.tsx:78` |
| `use-dashboard-leads.ts:24` → `useDashboardLeads` | **vivo**: `copilot-local-tips.tsx:25` |

O do export é o que importa: `pipeline-header.tsx:166,169` chama `doExport('csv', activePipelineId)`, então **o export do Pipeline é escopado por funil hoje**. Apagar o filtro sem substituto faria o arquivo baixado trazer todos os contatos da empresa, calado. É vazamento de escopo num arquivo que o usuário repassa, não número errado na tela.

**Decisão: o recorte sai do service e vai para cada chamador, que já tem os negócios na mão. Nenhum dos dois precisa de mecanismo novo.**

- **`useExportLeads`** usa `limit: 0` (`:29`), não pagina, e já carrega `deals` filtrados pelo mesmo `pipelineId` na mesma passada. Deriva o recorte desses negócios. É a mesma edição que resolve a coluna "Pipeline" do export (4.6).
- **`useDashboardLeads`** usa `limit: 500`, mas o consumidor já cruza com `activeLeadIds` vindo de `useDashboardDeals(pipelineId)`, que **já filtra por `deals.pipeline_id`** (`copilot-local-tips.tsx:27,31`). O filtro de pipeline naquela query é redundante: quem decide o conjunto é a interseção. Remover não muda semântica.

**O embed `deals!inner` foi avaliado e descartado.** Ele manteria o recorte no servidor com paginação, mas nenhum dos dois chamadores vivos precisa disso: um não pagina e o outro é card heurístico. Em troca traria comportamento do PostgREST que não dá para verificar sem rodar contra o banco, dentro de um caminho que gera arquivo baixado. Não vale.

Remover os componentes mortos fica fora desta onda (seção 10, pendência 1).

### 4.5 Edge Functions

**`lead-inbound-handler.ts`.** No insert (`:450`), apagar `pipeline_id: pipelineId`; manter o `const pipelineId = resolved.pipelineId ?? undefined` de `:374` só se ainda for usado depois, senão apagar junto. Ajustar os comentários de `:373` e `:446`, que citam a migration 027 e o `NOT NULL`.

No dispatch do SDR (`:280-291`), trocar o `select('is_ai_active, pipeline_id')` por `select('is_ai_active')` e usar **`resolved.pipelineId`**, que está em escopo desde `:97` na mesma função. Isso remove uma leitura de banco de quebra. Idem em `:316`, no payload do `sdr-engine`.

Acrescentar `pipelineId: resolved.pipelineId` ao payload do `sdr-ai` em `:322-330`. Este é o **único** chamador do `sdr-ai` no repo, então a mudança é completa.

**`sdr-ai/index.ts`.** Passa a ler `pipelineId` do body (`:239`). Remover `pipeline_id` dos dois selects (`:266`, `:358`) e usar o valor recebido em `:374`. Se vier vazio, o bloco de transfer segue com o `FALLBACK_TEMPLATE` que já existe em `:381`, sem erro: template de transferência tem default, ao contrário do `agent_profile`.

**`sdr-engine/index.ts`.** Remover `pipeline_id` do select de `:49` e aplicar a D12 em `:57-60`.

**`escalate-to-human.ts`.** Remover `pipeline_id` do select de `:73` e usar o pipeline já resolvido pelo `sdr-engine`, propagado pelo contexto da ferramenta. Mesmo tratamento do `sdr-ai`: sem pipeline, cai no `FALLBACK_TRANSFER_TEMPLATE`.

**`resolve-instance.ts`.** Remover `pipeline_id` do select de `:28` e o `?? lead?.pipeline_id` de `:38`, deixando só `ctx.pipelineId`. O PRD (seção 4) já demonstrou que esse fallback é redundante: o único chamador em modo `sdr` passa `pipelineId` explícito, e o ramo só roda depois de um inbound, que carimba `whatsapp_instance_name` e resolve na prioridade 1, antes do pipeline.

**`whatsapp-send/index.ts`.** Remover `pipeline_id` do select de `:87`. Em `:129`, passar o pipeline derivado por R1 sobre os negócios do lead. Se preferir uma passada menor: passar `undefined` e aceitar que o SDR caia na prioridade 3. **Não recomendo**: é justamente o caminho que a `sdr_instance_name` do pipeline existe para atender, e degradá-lo em silêncio faz o SDR responder por outro número.

**`instagram-webhook/index.ts`.** Apagar `pipeline_id: defaultPipeline?.id` de `:74` e ajustar o comentário de `:67-68`. O insert do negócio em `:83-90` já leva o pipeline.

**Atenção ao lint.** `tsc` e `npm run build` **não** passam por `supabase/functions/`. O `eslint` passa. Sem rodar o lint, metade desta seção não tem verificação automática nenhuma.

### 4.6 O export perde a coluna "Pipeline" se ninguém repuser


`export-leads.ts:32` e `:132` leem `l.pipelines?.name`, que vem do embed removido em 4.4. Achado da codificadora em 17/08.

**Repor pela R1, no negócio:** `use-export-leads` já carrega os negócios (`:31`), então anexa `pipeline_name` ao `ExportLeadRow.deal` e os dois leitores passam a ler `l.deal?.pipeline_name`. É o mesmo movimento que a Onda 2 fez com `stage_name`.

**Os dois produtores mudam juntos**, e um deles não tem rede:

- produtor de contatos, `use-export-leads`: tipado, o `tsc` pega **desde que `LeadWithDetails.pipelines` saia da interface junto com o select**. Remover só o select deixa o campo no tipo, o `tsc` passa limpo e a coluna esvazia em silêncio;
- produtor de negócios, `deals.tsx:161`: monta `pipelines` a partir do negócio, já correto, **mas é passado como `dealsAsLeads as never`** (`:230,233,236,253`). O cast apaga a checagem inteira desse lado.

Consequência prática: **esse lado só se verifica exportando de verdade e abrindo o arquivo**, nunca lendo código ou confiando no compilador. Está nos passos 16 e 17 da verificação.

### 4.7 `edit-lead-modal` resolve a etapa pelo negócio

`edit-lead-modal.tsx:77` faz `usePipelineStages(activeDeal?.pipeline_id ?? lead?.pipeline_id)`. Achado da codificadora; não estava no inventário de 1.2.

Fica só `activeDeal?.pipeline_id`. Contato sem negócio passa a não ter etapas para escolher, o que é coerente com a R1: oferecer as etapas de um pipeline que o contato não tem seria pior que não oferecer nenhuma.

**Este é o modal da pendência 4 da Onda 2** (Fase vindo vazia, causa não confirmada), e a linha 77 é a cadeia que alimenta aquele select. Não corrigir a pendência aqui. **Relatar** se o sintoma mudar em qualquer direção: é a primeira evidência nova sobre ela desde 14/08.

## 5. Migration, no repo do Hub

Arquivo em `hub/supabase/migrations/`, nunca em `veltzy/supabase/migrations/`, mesmo sendo tabela do schema `veltzy`.

### 5.0 A migration é DUAS, e essa correção veio de falha em teste

**Corrigido em 17/08/2026, depois de a criação de contato falhar no staging.** A versão anterior desta Spec previa uma migration só, aplicada depois do deploy do código. Está errado, e o teste provou: `pipeline_id` é `NOT NULL` sem default, então **código novo com a coluna ainda obrigatória quebra o insert imediatamente**. O raciocínio da seção 6 só tinha olhado o lado oposto (código velho com a coluna já dropada), e concluiu que existia uma ordem segura entre dois passos. Não existe. Faltava um passo.

O padrão correto é expand/contract, em três tempos:

| # | O quê | Por que é seguro |
|---|---|---|
| 1 | **Migration A:** `ALTER TABLE "veltzy"."leads" ALTER COLUMN "pipeline_id" DROP NOT NULL;` | código velho continua gravando normalmente, código novo pode omitir |
| 2 | **Deploy do código** (app e Edge Functions) | a coluna aceita `NULL`, então nenhum dos dois lados quebra |
| 3 | **Migration B:** backup, drop do trigger, da função e da coluna (5.1 a 5.4) | já não há quem leia nem quem escreva |

A janela entre 1 e 3 é a única fase em que os dois mundos coexistem, e é justamente para isso que a Migration A existe.

**Efeitos colaterais da Migration A, todos aceitáveis e temporários:**

- contato criado pelo app nasce com `pipeline_id` nulo. Quando ganhar um negócio, a `mirror_deal_to_lead` preenche sozinha, porque ela já tem a guarda `NEW.pipeline_id IS NOT NULL` e o `IS DISTINCT FROM`;
- as Edge Functions ainda não migradas continuam gravando o valor, sem alteração;
- os leitores de Edge Function que ainda existem toleram nulo: `resolve-instance.ts:38` cai no próximo nível, `sdr-engine:58` devolve o 400 que já devolvia, `sdr-ai:374` cai no template padrão;
- a FK `ON DELETE SET NULL` deixa de ser contraditória enquanto durar a janela.

**Migration A pode ser aplicada agora**, e deve: ela é o que destrava o código de `src/` que já está na árvore. **Migration B só depois das Edge Functions**, senão o inbound quebra: elas ainda gravam `pipeline_id` no insert do lead.

**A Migration A é pré-requisito do teste, não só do deploy.** Enquanto ela não for aplicada, o código de `src/` que já está na árvore **não funciona**: a criação de contato falha por violação de `NOT NULL`. Quem for revisar o diff e testar no navegador precisa aplicar A antes, senão o sintoma aparece como regressão do código e não como o que é, a coluna ainda obrigatória.

**Ela é reversível, ao contrário da Onda 3 e da Migration B.** `SET NOT NULL` traz de volta, e `DROP NOT NULL` não reescreve tabela nem toca em dado, por isso não há backup aqui. Mas a reversão só é limpa **enquanto não existir linha com nulo**: depois que o app novo criar o primeiro contato sem funil, voltar atrás passa a exigir decidir o que fazer com essas linhas. Se for para desistir da onda, desista antes de deployar o app.

Precisão sobre o espelho, verificada no corpo da função como a Onda 3 a deixou: a trava é `IF deal_count > 1 THEN RETURN NEW`, então ela **roda no primeiro negócio** e preenche o `pipeline_id`; o silêncio começa no segundo.

### 5.1 Backup

```sql
CREATE TABLE "veltzy"."leads_pipeline_backup_20260817" AS
SELECT "id", "company_id", "pipeline_id"
FROM "veltzy"."leads";
```

Só a chave e a coluna que some. Sem `name`, `phone` ou `email`: o backup existe para reconstituir uma coluna, não para duplicar a base de contatos. Mesmo desenho da Onda 3, pelo mesmo motivo de LGPD (seção 8).

**Prazo de descarte: 90 dias, até 15/11/2026.** `DROP TABLE veltzy.leads_pipeline_backup_20260817`.

### 5.2 O espelho e a trava multi-deal

```sql
DROP TRIGGER IF EXISTS "trg_mirror_deal_to_lead" ON "veltzy"."deals";
DROP FUNCTION IF EXISTS "veltzy"."mirror_deal_to_lead"();
```

Trigger antes da função, e os dois **antes** do `DROP COLUMN`. A função referencia `leads.pipeline_id` no corpo, e plpgsql não valida coluna até executar: se a coluna sumisse primeiro, o `DROP COLUMN` passaria limpo e o estrago apareceria no próximo insert em `deals`, que é o fluxo mais quente do produto. É a mesma armadilha que a Onda 3 documentou na 4.3, e é o motivo de a verificação 7.2 existir.

Com a função morre a trava multi-deal, que é o objeto que originou esta frente inteira.

### 5.3 A coluna

```sql
ALTER TABLE "veltzy"."leads" DROP COLUMN "pipeline_id";
```

Leva junto `idx_leads_pipeline` e `leads_pipeline_id_fkey`, por dependência.

### 5.4 Ordem, e ela não é negociável

1. Backup (5.1)
2. `DROP TRIGGER trg_mirror_deal_to_lead` (5.2)
3. `DROP FUNCTION mirror_deal_to_lead` (5.2)
4. `DROP COLUMN pipeline_id` (5.3)

**Sem `BEGIN`/`COMMIT` no arquivo**, seguindo a convenção do Hub. Não é só convenção: `supabase db push` já envolve cada arquivo numa transação, e um `COMMIT` no meio encerraria essa transação antes da hora, deixando o resto fora dela. A linha que pareceria blindar é a que quebraria a atomicidade.

Consequência prática: aplicar por `supabase db push`, que é o caminho preferido. **Colado no SQL Editor não há transação nenhuma**, e quem aplicar assim precisa envolver manualmente em `BEGIN` e `COMMIT`.

## 6. A fila até produção, e ela é o risco real desta onda

Nada aqui pode chegar em produção antes disto, **nesta ordem**:

| # | O quê | Estado em 17/08/2026 |
|---|---|---|
| 1 | Onda 1 do `historico-por-negocio` (`20260812104156`) promovida | só no staging |
| 2 | **Deploy do app com as Ondas 1 e 2** | pendente |
| 3 | Onda 3 (`20260814105318`) aplicada em produção | não aplicada |
| 4 | Esta onda: código deployado, depois a migration | não iniciada |

**O passo 2 é o que mais se pula, e é o que quebra produção.** Produção ainda roda código que lê `leads.stage_id`, `status` e `deal_value`. Quem alimenta essas três colunas é a `mirror_deal_to_lead`, na versão antiga, que ainda espelha as três. Se a migration desta onda dropar a função antes do deploy, o espelho morre com o app ainda dependendo dele, e as três colunas congelam sem erro nenhum.

~~Dentro desta onda, o código vai **antes** da migration, pelo motivo simétrico: enquanto o app gravar `pipeline_id` no insert, o `DROP COLUMN` derruba a criação de contato e a entrada de lead pelo WhatsApp.~~

**Corrigido em 17/08/2026.** Aquilo estava pela metade: é verdade que código velho com a coluna dropada quebra, mas código novo com a coluna `NOT NULL` quebra também, e foi o que aconteceu no teste da criação de contato. Não há ordem segura entre dois passos. A sequência dentro desta onda é a de três tempos da 5.0: **Migration A (`DROP NOT NULL`) → deploy do código → Migration B (o drop)**. Em produção, essa sequência inteira entra depois dos quatro passos da tabela acima.

**No staging nada disso bloqueia**, porque a Onda 3 está aplicada lá desde 14/08.

## 7. Verificação

### 7.1 Antes de aplicar a migration, no ambiente alvo

1. Código desta onda deployado no ambiente. `grep -rn "pipeline_id" src/ supabase/functions/` não pode achar leitura ou escrita de `leads.pipeline_id`; as exceções conhecidas são as da tabela de falsos positivos em 1.2.
2. Rodar de novo o inventário de objetos do banco sobre `leads.pipeline_id` (`pg_proc.prosrc`, `pg_policies`, `pg_views`, `pg_trigger`). **Se aparecer objeto fora de 1.3, pare.** O levantamento é de 17/08 e a Onda 3 já provou que existe objeto que nenhuma Spec conhecia.
3. A fila da seção 6 cumprida, passo a passo. O passo 2 dela é o crítico.
4. Backup criado, com contagem conferida contra `SELECT count(*) FROM veltzy.leads`.

### 7.2 Depois de aplicar, e o passo 5 é o que pega a armadilha

5. **`INSERT` de um negócio de teste em `veltzy.deals`.** Tem que funcionar. Este é o passo que revela função plpgsql com referência órfã, e é o motivo da ordem de 5.4. Se falhar, a migration passou mas o sistema está quebrado.
6. **`UPDATE veltzy.leads SET temperature = temperature WHERE id = '<id real>';`** Idem, pelo lado do contato.
7. **Entrada de lead novo pelo WhatsApp**, ponta a ponta. É o caminho que mais escrevia na coluna.
8. **Cadastrar contato pelo modal**, e conferir que ele nasce sem negócio e sem erro.
9. **Cadastrar contato numa empresa sem pipeline nenhum.** Tem que funcionar agora (4.2). Antes o botão ficava desabilitado.
10. **Import de CSV com a coluna "Pipeline" preenchida**, conferindo que o negócio nasce no pipeline certo.
11. **Desativar um pipeline com negócio.** Tem que bloquear, com a mensagem nova citando negócios (D11).
12. **Desativar um pipeline vazio.** Tem que funcionar. Se o guard novo estiver errado, ele barra aqui sem motivo.
13. **Abrir o inbox** num contato com negócio aberto e conferir o pipeline no cabeçalho (D9); depois num contato **sem** negócio, e conferir que o badge some em vez de aparecer vazio.
14. **Painel admin**, contagem por pipeline: número coerente com Negócios, e rótulo dizendo "negócios" (D10).
15. **SDR respondendo** num contato com negócio, e o transfer usando o template do pipeline certo.
16. **Exportar de Contatos com um pipeline selecionado**, abrir o arquivo e conferir duas coisas: a coluna "Pipeline" preenchida (4.6) e **só contatos daquele funil** (4.4). A segunda é a que pega vazamento de escopo, e nenhum compilador pega por você.
17. **Exportar de `/deals`**, abrir o arquivo, conferir a coluna "Pipeline". Este passo é obrigatório e não é redundante com o 16: aquele produtor passa por `as never` (`deals.tsx:230`), então o `tsc` não checa nada ali.
18. **Abrir o modal de edição de contato** num contato com negócio e em outro sem, conferindo o select de Fase (4.7). Relatar o que acontecer com a pendência 4 da Onda 2.

## 8. LGPD

**Não há tratamento novo de dado pessoal.** `pipeline_id` é dado de negócio, não do titular. Como nas ondas anteriores, o efeito é o oposto: uma duplicação a menos sobre o titular, o que atende o princípio de necessidade (art. 6º, III).

O ponto de atenção é o backup de 5.1, desenhado para não virar problema: só `id`, `company_id` e a coluna, sem nome, telefone ou email, com prazo de descarte de 90 dias. Um `SELECT *` ali criaria cópia integral da base de contatos sem finalidade definida, que é exatamente o que a seção 7 do PRD pede para evitar.

Nada muda em retenção, base legal ou compartilhamento. `activity_logs` não é tocado.

## 9. Fora de escopo

A frente do `max_rows` (PRD 6.1). **Correção de 17/08/2026:** o PRD dizia que ela precede esta onda. Isso era prioridade, não pré-requisito técnico. As duas frentes quase não se tocam: os pontos desta onda usam contagem no servidor, imune ao teto. A única interseção é a D10, tratada lá mesmo. Esta onda pode ser feita antes daquela sem prejuízo. Renomear `check_stage_has_leads`, herdada da Onda 3. A pendência da Fase vazia no modal (Onda 2, pendência 4). Os três `conversation_status` inválidos do copiloto e as pendências de erro engolido do `HubClient` e do `ai-complete`. Remover o código morto inventariado abaixo. Renomear `CreateLeadInput.pipeline_id` (4.1).

## 10. Pendências

1. **Inventário de código morto encontrado nesta varredura**, todo ele fora desta onda e nenhum tocado aqui: `useDashboardMetrics` e portanto `getConversionMetrics`; `MonthlyComparisonChart` e portanto `getMonthlyComparison`; `FollowUpTips` e portanto `useLeads` e o `LeadFilters.pipelineId` desta onda. São três componentes ou hooks sem consumidor, atravessando quatro camadas. Merece uma passada própria, porque cada um deles custa manutenção toda vez que alguém varre o repo, como esta Spec acabou de custar.

2. **`useContacts` lê contatos com `limit: 0`** (`use-contacts.ts:35`), que pula o `range` e cai direto no teto do PostgREST. Com 1479 contatos em produção, **a página de Contatos já está truncada em 1000 hoje**, sem erro e sem sintoma. Não é desta onda: é a frente do `max_rows` (PRD 6.1), e reforça a prioridade dela.

3. **`veltzy.activity_logs` continua sem índice por `resource_id`.** Herdada da Onda 3, pendência 2.

5. **A janela de 500 do `useDashboardLeads` passa a ser da empresa, não do pipeline** (4.4). Aceito nesta onda: numa empresa grande, contato daquele funil pode cair fora dos 500 e a dica dele some do card do copiloto. É fallback heurístico e a janela de 500 já era arbitrária antes, mas é degradação real e fica registrada para não virar surpresa.

4. **O rótulo "Negócios" no comparativo mensal do dashboard plota contatos** (`monthly-comparison-grid.tsx:166-169`, `dataKey="leads"`). Achado em 17/08 ao mapear a tela para o teste da D5. É rótulo errado, não número errado, e a correção é de uma palavra.
