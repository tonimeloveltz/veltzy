# Spec: Limpeza das colunas de negócio em `leads`, Onda 2

> Feature: `limpeza-colunas-negocio-em-leads` / Onda 2 (`stage_id`)
> PRD: `docs/features/limpeza-colunas-negocio-em-leads/PRD.md`
> Onda anterior: `Spec-onda1.md` (mergeada em 13/08/2026)
> Status: Pronta para implementação
> Data: 2026-08-13

---

## 0. Resumo

`leads.stage_id` deixa de ser lida e escrita. **Sem migration**, como a Onda 1: a coluna fica órfã até a Onda 3.

A onda saiu menor do que o PRD previa, por um motivo que só apareceu ao rastrear os call sites: **`bulkMoveToPipeline` de contatos também é código inalcançável** (1.2), pelo mesmo padrão do `bulkArchive` da Onda 1. Com isso some a única decisão de produto que a onda tinha, que era o que fazer com os 103 contatos sem negócio ao mover pipeline em lote.

Esse mesmo achado **invalida uma decisão documentada da frente `historico-por-negocio`**. Ver seção 2.

O item de maior risco não é nenhum desses: é o `LEAD_WITH_DETAILS_SELECT` (1.1), que sustenta a lista de contatos inteira.

## 1. O que muda

### 1.1 O select principal de contatos

```ts
// src/services/leads.service.ts:68-73
const LEAD_WITH_DETAILS_SELECT = `
  *,
  lead_sources:source_id(*),
  pipeline_stages:stage_id(*),   // <-- sai
  pipelines:pipeline_id(*)        // <-- fica, é da Onda 4
`
```

O embed resolve a FK `leads_stage_id_fkey`. Removida a coluna, o PostgREST devolve **erro na query inteira**, não campo vazio, e isso derruba `getLeadsByCompany` e `getLeadById` de uma vez. Por isso o embed sai nesta onda, antes do drop.

Consumidores do embed, rastreados: apenas `export-leads.ts:33` (CSV e XLSX) e `:133` (PDF), via `l.pipeline_stages?.name`. Em `/deals` esse objeto não vem do embed, é remontado em `deals.tsx:162` a partir do `stageMap`, e não muda.

### 1.2 Duas funções mortas

Mesmo padrão da Onda 1.1, confirmado por rastreamento completo:

```
leadsService.bulkMoveToPipeline   (leads.service.ts:264)
  ← useBulkMovePipeline           (use-bulk-leads.ts:120)
    ← nenhum consumidor
```

`BulkMovePipelineModal` importa `useBulkMoveDealsPipeline` de `use-bulk-deals.ts` (linha 11) e chama `dealsService.bulkMoveToPipeline` com `dealIds`. A versão de contatos ficou órfã quando a tela migrou para negócios.

**Apagar:** `leadsService.bulkMoveToPipeline` e `useBulkMovePipeline`. Não migrar, não adaptar.

Some junto o caso que o PRD tratava como decisão de produto em aberto: o que fazer com contato sem negócio ao mover pipeline em lote. Não existe operação que faça isso.

**`LeadFilters.stageId`** (`leads.service.ts:76` e o `if` de `:106-108`) também não tem quem passe. Sai junto.

### 1.3 Guard do `deleteStage`

```ts
// src/services/pipeline.service.ts:55-63
const { count } = await veltzy()
  .from('leads')                    // <-- passa a ser 'deals'
  .select('id', { count: 'exact', head: true })
  .eq('stage_id', stageId)
  .eq('company_id', companyId)

if (count && count > 0) {
  throw new Error(`Mova os ${count} leads deste stage antes de deletá-lo`)
}
```

Passa a contar `deals`. A contagem fica **mais correta**, não só diferente: hoje ela conta contatos cujo `stage_id` pode estar congelado pela trava multi-deal do espelho, então já erra para os 23 divergentes medidos em produção.

A mensagem muda de "leads" para "negócios", que é o que está sendo contado.

### 1.4 Export: a etapa passa a vir do negócio

`use-export-leads.ts:42-51` já monta um mapa de negócio por contato:

```ts
dealByLead.set(d.lead_id, { value: d.value, status: d.status })
```

Estender com o nome da etapa, que `getDealsByCompany` já traz pelo embed do próprio negócio (`DEAL_WITH_LEAD_SELECT` tem `pipeline_stages:stage_id(*)`):

```ts
dealByLead.set(d.lead_id, {
  value: d.value,
  status: d.status,
  stage_name: d.pipeline_stages?.name ?? null,
})
```

`ExportLeadRow` (`export-leads.ts:10`) ganha `stage_name` no objeto `deal`, e as duas linhas de leitura passam a `l.deal?.stage_name ?? ''` (CSV) e `?? '-'` (PDF).

Isso segue a mesma convenção que a Onda 1 usou para valor e status: a coluna do export vem do negócio representativo, e contato sem negócio fica vazio.

**`ExportLeadRow` tem dois produtores, e o segundo é `deals.tsx`.** Acrescentado em 13/08/2026, no review: a primeira versão desta Spec listou só o `use-export-leads.ts` e teria deixado a coluna Etapa vazia no export da tela de Negócios. O `dealsAsLeads` (`deals.tsx:149-166`) monta o objeto `deal` na linha 160 e precisa preencher `stage_name` também:

```ts
deal: { value: d.value, status: d.status, stage_name: stageMap.get(d.stage_id ?? '')?.name ?? null },
```

O `tsc` **não** pega esse esquecimento: as três chamadas de export em `deals.tsx:230,233,236` passam `dealsAsLeads as never`. O comentário em `deals.tsx:144-148` já advertia que "as colunas Valor, Pipeline, Etapa e Status saem vazias no CSV/XLSX/PDF" sem esse cuidado.

### 1.5 Automações

`run-automations/index.ts` tem dois usos, e o segundo é o silencioso:

1. `:80` monta `oldValue = { stage_id: lead.stage_id, ... }` para o log.
2. `:66` chama `evaluateCondition(c, lead)`, e `:15` lê `lead[condition.field]` **por nome**. Uma regra salva com condição em `stage_id` simplesmente para de casar quando o campo some do objeto. Sem erro, sem log: a automação deixa de disparar.

Correção: enriquecer o objeto antes de avaliar, preservando o formato das regras já salvas.

```ts
// depois do select de lead (:52-56), antes do loop de regras
const { data: activeDeal } = await supabase
  .from('deals')
  .select('stage_id')
  .eq('lead_id', leadId)
  .eq('status', 'open')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

const leadForRules = { ...lead, stage_id: activeDeal?.stage_id ?? null }
```

`leadForRules` passa a alimentar `evaluateCondition` e o `oldValue`. Contato sem negócio aberto fica com `stage_id: null`, e a condição não casa, que é o comportamento correto: ele não está em etapa nenhuma.

É a convenção D2 do PRD, e é a mesma consulta que a ação `change_stage` já faz logo abaixo (`:87-95`).

### 1.6 Copiloto

```ts
// supabase/functions/ai-copilot/index.ts:285-291
.from('leads')
.select('id, name, phone, assigned_to, stage_id, pipeline_stages:stage_id(name)')
```

Bloco "leads quentes sem contato há 3+ dias", que gera notificações. Passa a ler de `deals`, com o contato embutido, no mesmo formato que a Onda 1 adotou em 1.2.1:

```ts
.from('deals')
.select('id, stage_id, assigned_to, lead_id, pipeline_stages:stage_id(name), leads:lead_id(name, phone)')
.eq('company_id', companyId)
.eq('status', 'open')
.in('leads.temperature', ['warm', 'hot', 'fire'])
.not('assigned_to', 'is', null)
.limit(100)
```

**Atenção ao filtro por temperatura:** em PostgREST, filtrar por coluna de tabela embutida não exclui a linha pai por padrão, apenas zera o embed. Sem `!inner`, o bloco passa a notificar sobre negócios de contato frio.

A sintaxe é `leads:lead_id!inner(name, phone)`: o `!inner` modifica a **relação**, não o alias. ~~`leads!inner:lead_id(...)`~~ é inválido, e foi o que a primeira versão desta Spec trazia. Correção da codificadora em 13/08/2026, aceita.

Esta é a linha de maior risco da onda, e ela não é verificável sem deploy. Por isso a mesma query leva um `if (hotDealsError) console.error(...)`: uma sintaxe errada aqui precisa aparecer no log, e não sumir como os três `conversation_status` sumiram por meses.

O consumidor (`:293` em diante) usa `lead.id` para buscar mensagem e para o dedup `hasDuplicate(lead.id, ...)`. **Manter o id do contato ali**, não trocar pelo id do negócio: a notificação é sobre o contato e a checagem de duplicata depende disso. Passa a ser `d.lead_id`.

E o `console.error` no `catch` geral, que a Onda 1 deixou como recomendação e não entrou: **entra agora** (1.9).

### 1.7 Import e criação de contato

- **`import-leads.service.ts:305`**: remover `stage_id` do insert de `leads`. O negócio já grava (`:227`, `stage_id: row.stage_id`). Não tocar em `row.stage_id`, que é a coluna do CSV e continua alimentando o negócio, nem em `resolveDealStatusFromStage`, que a usa.
- **`new-contact-modal.tsx:144-147`**: remover o `stage_id: ''`, junto com o comentário que explicava a gambiarra. Some com o campo do tipo (1.8).

### 1.8 Tipos

**`src/types/database.ts`:**
- apagar `stage_id` de `Lead` (`:229`) e de `CreateLeadInput` (`:268`);
- `LeadWithLastMessage` (`:438`) fica `Omit<Lead, 'stage_id'>` com a chave inexistente. Trocar por `extends Lead` direto, sem `Omit`.

**`src/lib/copilot-tips.test.ts:17`**: tirar `stage_id: 's1'` da fixture de contato. Não confundir com `:38` e `:45`, que são fixtures de **negócio** e ficam.

**`edit-lead-modal.tsx`**: `:109` `stage_id: activeDeal?.stage_id ?? lead.stage_id` vira `activeDeal?.stage_id ?? ''`, e `:118` `const oldStageId = activeDeal?.stage_id ?? lead.stage_id` vira `activeDeal?.stage_id`. O schema do formulário (`:57`) não muda: ele descreve o campo do negócio.

**Tirar esse fallback expõe um defeito de timing que já existia.** Encontrado pela Leticia no passo 6, em 14/08/2026: o campo Fase abre vazio na primeira vez e preenchido na segunda.

`useDealsByLead` tem `staleTime: 30s`, então na primeira abertura `deals` é `undefined`, `activeDeal` também, e o `useEffect` de `:88` reseta o formulário com `stage_id: ''`. O `Select` do Radix renderiza sem valor e, como o `SelectContent` só monta ao abrir, não há item registrado para resolver o texto; quando o negócio chega e o effect roda de novo, o trigger não reavalia. Na segunda abertura o cache está quente, o valor nasce correto e funciona.

O `lead.stage_id` mascarava isso por fornecer o valor certo já no primeiro render. A correção é resetar só depois que os negócios chegarem:

```ts
const { data: deals, isError: dealsError } = useDealsByLead(lead?.id)
const dealsReady = deals !== undefined || dealsError

useEffect(() => {
  if (lead && dealsReady) {
    reset({ /* corpo inalterado */ })
  }
}, [lead, activeDeal, dealsReady, reset])
```

Ataca a causa (formulário resetado com dado incompleto) e não o sintoma. O preço é o formulário inteiro ficar vazio por um instante em vez de só a Fase, o que é preferível a preenchido com valor errado.

**O `|| dealsError` não é enfeite.** Achado da codificadora em 14/08/2026, ao analisar o que a própria correção introduzia: sem ele, uma falha na busca de negócios (rede, RLS, 500) deixa `deals` em `undefined` para sempre e o formulário **nunca** reseta, então o usuário não vê nem o telefone do contato. Com ele, a falha volta a degradar como antes: o contato aparece e só a Fase fica vazia.

Fica descoberto o caso de a query nunca rodar (`enabled: !!companyId && !!leadId`, `use-deals.ts:80`), em que ela fica `pending` parada e não gera erro. Decisão consciente: exige empresa ausente com usuário autenticado navegando no kanban, cenário em que o app já estaria quebrado antes de chegar aqui.

### 1.9 Observabilidade do copiloto, que a Onda 1 deixou passar

No `catch` geral de `ai-copilot/index.ts:416`, acrescentar:

```ts
console.error('[ai-copilot]', err)
```

Não estava na Onda 1 e custou uma investigação inteira em 13/08/2026: a função devolvia 500 sem imprimir nada, e o log só mostrava `booted`/`shutdown`. Entra aqui porque esta onda mexe na mesma função e porque o bloco de 1.6 é mais uma query que pode falhar em silêncio.

Isso **não** cobre as duas pendências maiores de erro engolido, que seguem fora de escopo (seção 6).

## 2. O que este achado cobra da outra frente

A Spec da Onda 1 do `historico-por-negocio` (`Spec-onda1.md:110`) diz, sobre a Onda 1.5:

> **Não é para remover os ramos.** Remover cria ponto cego: `bulkMoveToPipeline` (`leads.service.ts:275`) escreve `leads.stage_id` direto, em lote, sem log próprio, e ficaria sem histórico.

**Essa justificativa não se sustenta hoje**, pelo rastreamento de 1.2: a função é inalcançável pela interface. Não há ponto cego a proteger, porque não há escrita.

Consequência prática, e ela é a favor das duas frentes: depois desta onda, **nada no código escreve `leads.stage_id`**, e o único UPDATE que sobra na coluna é o eco do próprio espelho. A Onda 1.5 pode então remover os ramos, em vez de acrescentar `pg_trigger_depth() = 1` para distinguir eco de escrita direta.

**Não decidir isso aqui.** É Spec de outra frente, e a solução com `pg_trigger_depth()` funciona nos dois cenários, só é mais complicada que o necessário. O que esta Spec faz é registrar que a premissa mudou, para que quem escrever a Onda 1.5 não copie uma justificativa vencida.

A ordem entre as frentes continua valendo e é a de sempre: a Onda 1.5 (tirar o eco) tem que rodar **antes** da Onda 3 daqui (dropar a coluna), senão `log_lead_activity` fica referenciando `OLD.stage_id` de uma coluna que não existe.

## 3. Arquivos afetados

**No Veltzy (10):**

| Arquivo | O que muda |
|---|---|
| `src/services/leads.service.ts` | tira o embed, apaga `bulkMoveToPipeline` e o filtro `stageId` |
| `src/hooks/use-bulk-leads.ts` | apaga `useBulkMovePipeline` |
| `src/services/pipeline.service.ts` | guard do `deleteStage` conta negócios |
| `src/hooks/use-export-leads.ts` | `stage_name` no mapa de negócio |
| `src/lib/export-leads.ts` | tipo `ExportLeadRow` e as duas leituras |
| `src/components/pipeline/edit-lead-modal.tsx` | tira os dois fallbacks |
| `src/components/contacts/new-contact-modal.tsx` | tira o `stage_id: ''` |
| `src/services/import-leads.service.ts` | tira `stage_id` do insert de contato |
| `src/types/database.ts` | tira `stage_id` dos dois tipos, ajusta o `Omit` |
| `src/lib/copilot-tips.test.ts` | fixture de contato |
| `src/pages/deals.tsx` | `stage_name` no objeto `deal` de `dealsAsLeads` (ver 1.4) |

**Edge functions (2):** `ai-copilot/index.ts` (1.6 e 1.9), `run-automations/index.ts` (1.5).

Não mudam: `deals.service.ts`, `dashboard.service.ts`, kanban, inbox, `csv-parser.ts`, `preview-step.tsx`, `mapping-step.tsx`, `copilot-tips.ts` (já lia do negócio), `active-deal-info.ts`, `forecast.ts`.

## 4. Verificação

### 4.1 Automática

```bash
npx tsc --noEmit
npm run lint      # baseline contra o merge-base, em worktree separado
npm run build
npm test
```

O `tsc` vale muito de novo, e mais que na Onda 1: `stage_id` é `string` (não opcional) no tipo `Lead`, então todo leitor aparece.

Grep complementar, porque edge function não passa pelo `tsc` do app:

```bash
grep -rn "stage_id" src/ supabase/functions/ \
  | grep -vE "csv-parser|preview-step|mapping-step|deals|deal|forecast|active-deal-info|pipeline_stages:stage_id|use-pipeline-stages|stage-manager|stage-column"
```

Esperado: nenhum hit em contexto de contato.

### 4.2 Manual, no navegador

O item de maior risco é o 1.1, e ele quebra **feio**, não sutil: se o embed sair errado, a lista de contatos vem vazia ou com erro. Os dois primeiros passos cobrem isso.

1. **Abrir Contatos.** A lista carrega. Este passo sozinho prova que o `LEAD_WITH_DETAILS_SELECT` continua válido; se o embed estivesse errado, o PostgREST devolveria erro e a tela ficaria vazia.
2. **Abrir o Dashboard.** Os cards carregam. Mesmo select, outro consumidor (`use-dashboard-leads`), com filtro por pipeline.
3. **Exportar da tela de Contatos** em CSV e PDF. A coluna **Etapa** vem preenchida para contato com negócio, e vazia para contato sem negócio. Este é o passo que prova 1.4. Compare com o export da tela de **Negócios**, que não mudou: a mesma etapa deve aparecer nos dois.
4. **Tentar excluir uma etapa que tem negócios.** Deve bloquear, com a mensagem citando a quantidade de **negócios**. Prova 1.3.
5. **Excluir uma etapa vazia.** Deve funcionar. Se o guard ficou contando errado, ele bloqueia aqui sem motivo.
6. **Abrir um negócio pelo modal**, conferir que a etapa vem selecionada corretamente, mudar de etapa e salvar. Prova 1.8.
7. **Criar um contato puro** pela tela de Contatos, sem negócio. Deve salvar. Prova 1.7, e este é o passo que mostra o ganho: o formulário não precisa mais inventar um `stage_id`.
8. **Importar planilha** com a coluna "Etapa". Os negócios criados aparecem na etapa certa do kanban.
9. **Automação com condição em etapa:** se houver regra salva com `stage_id`, disparar o gatilho e conferir em `automation_logs` que ela continua casando. Prova 1.5. **Se não houver nenhuma regra assim configurada, diga isso em vez de marcar como verde** — é o passo mais fácil de falhar em silêncio.

### 4.3 Não regressão

10. Kanban idêntico: já lia de `deals`.
11. Inbox idêntico.
12. Card do Copiloto no dashboard: continua caindo no fallback local enquanto o gateway do Hub estiver com erro (investigação de 13/08/2026, fora desta onda). Isso **não** é regressão desta entrega.

## 5. Fora de escopo

`pipeline_id` (Onda 4), incluindo o embed `pipelines:pipeline_id(*)`, o guard do `deletePipeline` e os sete filtros do dashboard. O `DROP COLUMN`, que é a Onda 3. A Onda 1.5 do `historico-por-negocio`, que esta onda destrava mas não executa. Os três `conversation_status` inválidos do copiloto. As duas pendências de erro engolido do `HubClient` e do `ai-complete`.

## 6. Pendências

1. **Herdadas da Onda 1, todas em aberto:** os três `conversation_status` inválidos (`ai-copilot:64`, `:76` corrigido, `:97`); o `HubClient` descartando o corpo dos 5xx (`_shared/hub-client.ts:88`, arquivo do Veltzy); o `ai-complete` respondendo 500 para erro de provedor (repo do Hub); e `createDealsForImportedLeads` ser best-effort.

2. **O gateway de IA está quebrado no staging.** Diagnosticado em 13/08/2026: `ai-complete` devolve 500, o `ai-copilot` propaga como `HTTP_ERROR` e o card cai no fallback. A causa exata está no log do `ai-complete` e não foi lida. Enquanto durar, nenhum bloco do copiloto pode ser validado de ponta a ponta, incluindo o de 1.6.

3. **`BulkActionBar` segue com um `mode` de um valor só**, agora com dois ramos mortos removidos (arquivar na Onda 1, mover pipeline nesta). Reforça a pendência 3 da Onda 1: decidir se a tela de Contatos ganha ações em lote ou se o parâmetro sai.

4. **O campo Fase abre vazio no modal do kanban.** Aberta em 14/08/2026, por decisão da Leticia de tratar depois.

   Estado exato, para não se perder:

   - **O crash foi resolvido.** A guarda `dealsReady` fazia o `DialogContent` montar antes do primeiro `reset`, e `LeadTagsInput` (`lead-tags-input.tsx:38`) faz `value.map()` sobre um `string[]` não-opcional. Corrigido com `defaultValues: { tags: [], stage_id: '' }` e `?? []` no ponto de uso. O modal abre.
   - **A Fase segue vazia**, e a causa está isolada: o `Select` do Radix não reavalia o texto do trigger quando o `value` chega depois, porque o `SelectContent` só monta ao abrir o dropdown e não há item registrado. As duas outras hipóteses foram eliminadas (o reset com dado incompleto, pela guarda; a transição uncontrolled → controlled, pelo `stage_id: ''`).
   - **A correção provável é uma linha**, `<Select key={activeDeal?.id ?? 'none'} ...>`, que força o remount quando o negócio chega. Não aplicada.
   - **Não medido:** se a Fase enche na segunda abertura, como acontecia antes da guarda. Isso decide se o estado atual está igual ou pior que o da primeira entrega da onda, e ninguém verificou.

   **Quem for medir precisa separar dois caminhos**, senão o resultado volta ambíguo. As deps do effect são `[lead, activeDeal, dealsReady, reset]`, e reabrir o mesmo contato com o cache quente devolve as mesmas referências, então o effect **não re-roda**: a segunda abertura herda o estado do formulário deixado pela primeira. Passados os 30s de `staleTime` do `useDealsByLead`, o refetch cria array novo, `activeDeal` muda de referência, o effect re-roda e o reset acontece de novo com o `SelectContent` ainda desmontado, que é a condição do sintoma. Reabrir **dentro** e **depois** dos 30s são caminhos diferentes e só o segundo dispara reset novo.

   O elo que decide tudo não é do nosso código: é se o `SelectValue` do Radix consegue resolver o texto de um valor cujo `SelectItem` nunca foi montado. Análise da codificadora em 14/08/2026.

   O impacto é visual, não de dados: o `reset` grava o `stage_id` correto no formulário, então salvar sem tocar no campo preserva a etapa. O risco real é de indução: o vendedor vê vazio, supõe que precisa escolher, e move o negócio sem querer.

5. **`LeadWithDetails.pipeline_stages` (`types/database.ts:254`) ficou vestigial.** Achado da codificadora em 13/08/2026. O embed que preenchia o campo saiu em 1.1 e não sobrou consumidor, então o tipo promete um objeto que nunca vem, a mesma categoria de mentira que justificou tirar o `Omit` na Onda 1. Deixado de fora desta onda de propósito: removê-lo exige varrer todos os produtores de `LeadWithDetails`, e não vale misturar com a correção de regressão do export. `DealWithLead.pipeline_stages` (`:331`) é legítimo e fica.
