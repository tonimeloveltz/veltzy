# Spec: Limpeza das colunas de negócio em `leads`, Onda 1

> Feature: `limpeza-colunas-negocio-em-leads` / Onda 1 (`status` e `deal_value`)
> PRD: `docs/features/limpeza-colunas-negocio-em-leads/PRD.md`
> Status: Pronta para implementação
> Data: 2026-08-13
> Fonte consultada: código do Veltzy em `feat/historico-por-negocio` e baseline do **Hub** (`../hub`)

---

## 0. Resumo

`leads.status` e `leads.deal_value` deixam de ser lidas e escritas pelo código. **Sem migration**: as colunas continuam no banco, órfãs, até a Onda 3. Rollback é reverter o commit.

A onda é menor do que o PRD supunha, e por um motivo que só apareceu ao rastrear os call sites: **o arquivamento de contato é código inalcançável**. Ver 1.1. A D6 do PRD está errada e é corrigida aqui.

E ela corrige um defeito silencioso de produção que não tem nada a ver com limpeza: o bloco "Deals em aberto" do copiloto está quebrado desde sempre. Ver 1.2.1.

## 1. O que muda

### 1.1 `status`: arquivar contato nunca existiu na interface

A cadeia completa, rastreada em 13/08/2026:

```
leadsService.bulkArchive        (leads.service.ts:240)
  ← useBulkArchive              (use-bulk-leads.ts:51)
    ← bulk-archive-dialog.tsx:25, ramo mode !== 'deals'
      ← bulk-action-bar.tsx:116
        ← deals.tsx:251, único call site, sempre com mode="deals"
```

`BulkActionBar` tem `mode = 'leads'` como default, e **o default nunca é exercido**. `deals.tsx:256` passa `mode="deals"` explicitamente, e é a única tela que monta a barra. `contatos.tsx` (270 linhas) não tem seleção múltipla nem ação de arquivar.

Isso explica o `archived = 0` medido nos dois ambientes (PRD 2.1): não é feature em desuso, é caminho que a interface nunca ofereceu.

**Consequência para esta Spec:** não há comportamento a preservar nem a migrar. O código morre.

- **`src/services/leads.service.ts`**: apagar `bulkArchive` (`:240-250`) inteira.
- **`src/hooks/use-bulk-leads.ts`**: apagar `useBulkArchive` (`:51-70`). `useBulkArchiveDeals` fica.
- **`src/components/deals/bulk-archive-dialog.tsx`**: cai o import de `useBulkArchive`, cai `bulkArchiveLeads`, cai o `if/else` de `handleArchive`, que vira só a chamada de deals.

  A prop `mode` **permanece**, porque ela também escolhe o rótulo ("negócio" contra "lead") em `:37`. Trocar isso é copy de tela e não é desta onda. O que sai é o ramo de escrita, não o parâmetro.

- **`src/components/deals/bulk-action-bar.tsx:38`**: hoje é

  ```ts
  const allArchived = selectedLeads.length > 0 && selectedLeads.every((l) => l.status === 'archived')
  ```

  Esse `l.status` **já não lê a coluna do contato**: os objetos vêm de `dealsAsLeads` (`deals.tsx:149`), onde `:159` monta `status: d.status`, o status do negócio. A linha funciona hoje por coincidência de nome de campo.

  Passa a ler o campo que o mesmo objeto já carrega em `:160`, `deal: { value, status }`:

  ```ts
  const allArchived = selectedLeads.length > 0 && selectedLeads.every((l) => l.deal?.status === 'archived')
  ```

  E a prop `leads` deixa de ser `LeadWithDetails[]` e passa a ser `ExportLeadRow[]` (já definido em `export-leads.ts:10`), que é o tipo que descreve o objeto que de fato chega ali. O call site usa `as never` (`deals.tsx:253`), então o tipo atual não protege nada hoje; a troca faz a assinatura contar a verdade.

- **`src/services/import-leads.service.ts`**: remover `status` do insert (`:315`) e a função `resolveStatusFromStage` (`:187-193`), que fica sem chamador. **Não** confundir com `resolveDealStatusFromStage` (`:197`), que continua sendo usada por `createDealsForImportedLeads` (`:222`) e é a que importa.

### 1.2 `deal_value`

- **`src/services/import-leads.service.ts:317`**: remover `deal_value` do insert de `leads`. O valor já vai para o negócio em `:227` (`value: row.deal_value ?? 0`).

  **Não mexer** em `ImportableRow.deal_value` (`:17`), no `LeadField` do `csv-parser.ts:135` nem no `preview-step.tsx:58`. Ali `deal_value` é o nome da coluna do CSV, não da coluna do banco, e continua alimentando `deals.value`.

- **`src/components/pipeline/edit-lead-modal.tsx:107`**: `deal_value: activeDeal?.value ?? lead.deal_value ?? 0` vira `deal_value: activeDeal?.value ?? 0`. O nome do campo do formulário não muda.

- **`supabase/functions/sdr-ai/index.ts:266`**: tirar `deal_value` do select. Ele não é lido por nome, entra no prompt via `JSON.stringify(lead)` (`:279`). Repontar para o negócio seria enriquecer o contexto do SDR, o que é decisão de produto e não desta onda; o que a onda faz é parar de mandar um valor espelhado que já não é confiável.

- **`supabase/functions/ai-copilot/index.ts:71-89`**: ver 1.2.1.

- **`src/pages/deals.tsx:156`** e **`src/components/pipeline/pipeline-board.tsx:167`** montam objetos com `deal_value: d.value`. **Não mudam.** São literais em memória alimentados pelo negócio, ambos passados com `as never`, e o campo é consumido pelo export. Renomeá-los é higiene de outra frente.

### 1.2.1 O bloco "Deals em aberto" do copiloto está quebrado hoje

```ts
// ai-copilot/index.ts:71-81
let dealsQuery = supabase
  .from('leads')
  .select('id, name, phone, deal_value, updated_at')
  .eq('company_id', company_id)
  .not('deal_value', 'is', null)
  .eq('conversation_status', 'open')      // <-- não existe
  .order('deal_value', { ascending: false })
```

`veltzy.conversation_status` é um enum de seis valores: `unread`, `read`, `replied`, `waiting_client`, `waiting_internal`, `resolved` (baseline do Hub, linha 122). **`'open'` não é um deles.** Postgres rejeita a comparação, o PostgREST devolve erro, e `:81` desestrutura só `data` sem checar `error`. Resultado: `openDeals` fica `undefined`, `totalOpenValue` é sempre 0 e `topDealsInfo` é sempre string vazia.

Ou seja, o copiloto responde sobre pipeline financeiro com dado vazio, sem erro em lugar nenhum.

A substituição corrige as duas coisas de uma vez, porque em `deals` o `status = 'open'` existe e é exatamente o conceito pretendido:

```ts
let dealsQuery = supabase
  .from('deals')
  .select('id, value, updated_at, leads:lead_id(name, phone)')
  .eq('company_id', company_id)
  .eq('status', 'open')
  .gt('value', 0)
  .order('value', { ascending: false })
if (isSeller && user_profile_id) {
  dealsQuery = dealsQuery.eq('assigned_to', user_profile_id)
}
const { data: openDeals, error: dealsError } = await dealsQuery.limit(5)
if (dealsError) console.error('[ai-copilot] deals em aberto:', dealsError.message)
```

`deals.assigned_to` existe (baseline, `veltzy.deals`), então o recorte por vendedor continua valendo sem intermediação do contato. Ele muda de sentido, e para melhor: passa a ser o dono do **negócio**, não o dono do contato. Os dois podem divergir.

**O filtro é `.gt('value', 0)`, não `.not('value', 'is', null)`.** Corrigido em 13/08/2026, no review: `veltzy.deals.value` é `numeric DEFAULT 0` (baseline linha 3425), então negócio sem valor preenchido tem `0` e não `null`. Um filtro de nulidade não excluiria ninguém, e o copiloto passaria a comentar negócio de R$ 0,00 como se fosse pipeline. `leads.deal_value` era nullable de verdade, e é isso que o filtro antigo aproveitava.

Os dois consumidores (`:83` e `:86-89`) passam a ler `d.value` e `d.leads?.name || d.leads?.phone`.

**O operador é `||`, não `??`.** Correção da codificadora em 13/08/2026, aceita: o original é `d.name || d.phone`, e com `??` um nome vazio (`''`) deixaria de cair para o telefone, que é justamente o caso que o fallback existe para cobrir.

**O `error` passa a ser checado.** Sem isso, o próximo campo errado repete a falha silenciosa que esta seção descreve.

> O mesmo defeito aparece em mais dois blocos do copiloto: `:64` compara com `'closed'` e `:97` com `'waiting'`, e nenhum dos dois pertence ao enum (o segundo foi achado da codificadora em 13/08/2026, durante a implementação). São **três** ao todo. **Não corrigir nesta onda**: não envolvem as colunas desta frente e merecem verificação própria de qual era a intenção em cada um. Ficam na seção 6.

### 1.3 Tipos

**`src/types/database.ts`:**

- apagar `LeadStatus` (`:2`) e o campo `status` de `Lead` (`:230`);
- apagar `deal_value` de `Lead` (`:238`) e de `CreateLeadInput` (`:271`);
- em `LeadWithLastMessage` (`:438`), o `Omit<Lead, 'stage_id' | 'status' | 'deal_value'>` passa a `Omit<Lead, 'stage_id'>`. TypeScript aceita `Omit` de chave inexistente sem erro, então isso não quebra nada se ficar; sai porque vira mentira sobre o tipo.
- `UpdateLeadInput` já não tem nenhum dos dois (`:281-283`). Não muda.

**`src/lib/copilot-tips.test.ts:19`**: a fixture declara `deal_value: null`. Remover o campo, senão o objeto deixa de bater com `Lead`.

`stage_id` continua em `Lead` e em `CreateLeadInput` nesta onda. Ele sai na Onda 2.

## 2. Correções ao PRD

**A D6 está errada.** Ela dizia que `bulkArchive` de contato viraria `bulkArchiveDeals` e que a consequência a validar seria "contato sem negócio não tem o que arquivar". Não há consequência nenhuma: o caminho é inalcançável (1.1). O código é removido, não migrado.

Isso também apaga o único risco de produto que a Onda 1 tinha. O que sobra é risco de regressão em tela, coberto pela seção 4.

## 3. Arquivos afetados

**No Veltzy (8).** Nenhum no Hub, nenhuma migration.

| Arquivo | O que muda |
|---|---|
| `src/services/leads.service.ts` | apaga `bulkArchive` |
| `src/hooks/use-bulk-leads.ts` | apaga `useBulkArchive` |
| `src/components/deals/bulk-archive-dialog.tsx` | tira o ramo de leads |
| `src/components/deals/bulk-action-bar.tsx` | `l.deal?.status`, prop retipada |
| `src/services/import-leads.service.ts` | tira `status` e `deal_value` do insert, apaga `resolveStatusFromStage` |
| `src/components/pipeline/edit-lead-modal.tsx` | tira o fallback de valor |
| `src/types/database.ts` | tira `LeadStatus`, `status`, `deal_value` |
| `src/lib/copilot-tips.test.ts` | fixture |

**Edge functions (2):** `ai-copilot/index.ts` (1.2.1), `sdr-ai/index.ts` (select).

Não mudam: `deals.service.ts`, `dashboard.service.ts`, kanban, inbox, `csv-parser.ts`, `preview-step.tsx`.

## 4. Verificação

### 4.1 Automática

```bash
npx tsc --noEmit
npm run lint      # baseline salvo fora do repo, contra o merge-base
npm run build
npm test
```

Aqui o `tsc` **vale muito**, ao contrário da Onda 1 do histórico: remover campo de tipo usado em 1479 linhas de dado é exatamente o que o compilador pega. Um `tsc` limpo é evidência de que não sobrou leitor.

Complementar com grep, porque edge function não passa pelo `tsc` do app:

```bash
grep -rn "deal_value\|LeadStatus" src/ supabase/functions/ \
  | grep -v "csv-parser\|preview-step\|import-leads.service.ts:17\|ImportableRow"
```

Esperado: só as linhas de `deals.tsx:156` e `pipeline-board.tsx:167`, que são literais em memória (1.2).

### 4.2 Manual, no navegador

O deploy das edge functions é passo separado do build do frontend. Os passos 6 e 7 só valem depois de `ai-copilot` e `sdr-ai` estarem publicadas.

1. **Negócios, selecionar dois e arquivar.** Funciona como antes. Recarregar com "Mostrar arquivados": aparecem arquivados.
2. **Negócios, selecionar dois já arquivados.** O botão Arquivar **não** aparece. Este é o passo que prova a troca de `l.status` por `l.deal?.status` em `bulk-action-bar.tsx:38`. Se o botão aparecer, o campo novo está vindo `undefined` e a comparação virou sempre falsa.
3. **Exportar da tela de Negócios** em CSV, XLSX e PDF. As colunas Valor e Status continuam preenchidas. A barra e o export compartilham o mesmo objeto retipado.
4. **Importar uma planilha** com a coluna "Valor do Negocio" preenchida e uma linha em etapa final. Conferir na tela de Negócios que o valor chegou e que a etapa final virou ganho ou perdido. É o que prova que remover os campos do insert de contato não perdeu dado, porque `createDealsForImportedLeads` já os grava.
5. **Editar um negócio pelo modal**, mudando o valor. Salva e persiste. Reabrir e conferir que o campo trouxe o valor do negócio, não zero.
6. **Copiloto: perguntar sobre negócios em aberto.** Deve responder com valor total e top 3. **Hoje isso vem vazio** (1.2.1), então este passo mede correção, não regressão. Se continuar vazio, checar o log da função pelo `console.error` novo.
7. **SDR: mandar mensagem para um lead com SDR ativo.** Continua respondendo e pontuando. O prompt perdeu um campo, o fluxo não muda.

### 4.3 Não regressão

8. Kanban e tela de Negócios seguem idênticos: etapa, valor e status já vinham de `deals`.
9. Inbox segue idêntico. `LeadWithLastMessage` já excluía os três campos.
10. A aba Histórico continua funcionando. Esta onda não toca em `activity_logs` nem nos triggers, e `log_lead_activity` segue lendo `OLD.status`, que continua existindo no banco.

## 5. Fora de escopo

`stage_id` (Onda 2) e `pipeline_id` (Onda 4). Qualquer `DROP COLUMN`, que é Onda 3. O segundo defeito de `conversation_status` em `ai-copilot:64`. Enriquecer o prompt do SDR com o valor do negócio. Renomear `deal_value` nos objetos em memória de `deals.tsx` e `pipeline-board.tsx`. A prop `mode` de `BulkActionBar`, que continua existindo pelo rótulo.

## 6. Pendências

1. **O copiloto tem três comparações inválidas de `conversation_status`**, das quais esta onda corrige só uma (a de 1.2.1, que envolvia `deal_value`). Sobram:

   | Linha | Compara com | Bloco | Intenção provável |
   |---|---|---|---|
   | `:64` | `'closed'` | leads sem interação há 24h | `resolved` |
   | `:97` | `'waiting'` | leads hot/fire sem resposta | `waiting_client` |

   Nenhum dos dois pertence ao enum de seis valores, e nenhum dos dois checa `error`, então os dois blocos entregam vazio em silêncio hoje. A correção depende de decidir a intenção de cada um, o que é leitura de produto e não de código. Frente pequena e própria, e o padrão de checar `error` deveria valer para toda a função.

2. **`createDealsForImportedLeads` é best-effort** (`import-leads.service.ts:229-236`): se o insert de negócios falhar, os contatos entram e os negócios não, e a função só faz `console.error`. Hoje o valor sobrevive em `leads.deal_value` como consolo acidental. Depois desta onda, não sobrevive. Isso não é regressão de comportamento observável, porque nada lê aquela coluna, mas remove a última rede. Vale transformar o par em operação atômica, ou ao menos reportar a falha na tela de importação.

3. **`BulkActionBar` tem um `mode` com um valor só.** A tela de Contatos nunca ganhou ações em lote, então metade da lógica de modo é especulativa. Vale decidir se a tela vai ganhar essas ações ou se o parâmetro sai.
