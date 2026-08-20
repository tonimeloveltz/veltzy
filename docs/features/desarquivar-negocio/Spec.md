# Spec: Desarquivar negocio em massa

> **Tela:** `/negocios` (`src/pages/deals.tsx`), barra de acoes em massa
> **Status:** Aprovada, aguardando implementacao
> **Migration:** NENHUMA. Esta Spec nao toca em `supabase/`.
> **Base:** branch `develop`

---

## 1. PROBLEMA

Hoje da para arquivar um negocio em massa, mas nao da para desfazer. Uma vez
arquivado, o negocio so volta pelo banco. O toggle "Mostrar arquivados"
(visivel so para admin/manager) exibe as linhas arquivadas, o usuario consegue
seleciona-las, e a unica acao oferecida ali e "Arquivar" de novo, que nao faz
nada de util.

Alem disso, a regra atual de visibilidade do botao Arquivar
(`bulk-action-bar.tsx:39`) usa `allArchived`: com selecao MISTA (arquivados e
nao arquivados juntos) o botao Arquivar aparece e arquiva tudo, inclusive o que
ja estava arquivado. O usuario nao consegue prever o que a acao faz.

## 2. ESCOPO

**Entra:**
1. Acao "Desarquivar" na barra de acoes em massa da tela de Negocios.
2. Nova regra de visibilidade: Arquivar so aparece se NENHUM selecionado estiver
   arquivado; Desarquivar so aparece se TODOS estiverem arquivados; selecao
   mista nao mostra nenhum dos dois.

**Nao entra (nao implementar):**
- Acao de desarquivar em linha unica (menu de contexto da tabela). A barra em
  massa ja cobre o caso de 1 selecionado.
- Desarquivar na tela de Contatos, no Pipeline ou no modal de edicao do lead.
- Coluna nova no banco, migration, RPC ou trigger.
- Log em `activity_logs` (o arquivamento tambem nao loga; manter a paridade).

## 3. DECISAO DE PRODUTO: para qual status o negocio volta

Nao existe coluna guardando o status anterior ao arquivamento, entao o status de
volta e DERIVADO. A regra abaixo e a mesma que o banco ja aplica no trigger
`set_deal_status_on_stage_change` (`supabase/migrations/062_deals_closed_at.sql`)
e a mesma que o kanban aplica ao soltar um card
(`pipeline-board.tsx`, `handleDragEnd`). Derivar da etapa mantem os tres pontos
concordando, em vez de criar uma quarta regra:

| Condicao do negocio arquivado                        | Status de volta      | `closed_at`        |
|------------------------------------------------------|----------------------|--------------------|
| Etapa com `is_final = true` e `is_positive = true`    | `won`                | preserva o atual   |
| Etapa com `is_final = true` e `is_positive` falso ou NULO | `lost`           | preserva o atual   |
| Demais etapas, com ou sem `assigned_to`               | `open`               | grava `null`       |
| Sem `stage_id`, com ou sem `assigned_to`              | `open`               | grava `null`       |

`assigned_to` NAO entra na regra. Decisao da Leticia em 20/08/2026, revertendo
a versao anterior desta Spec: negocio sem responsavel volta como `open` do mesmo
jeito, nunca como `pending_assignment`. Ou seja, desarquivar nunca coloca nada
na coluna "Sem dono" do kanban, nem mesmo o que estava la antes de ser
arquivado. Ele reaparece na coluna da propria etapa, sem responsavel.

`pending_assignment` continua existindo e e criado so pelo inbound, em conflito
de territorio (`lead-inbound-handler.ts:798`). Desarquivamento nao produz mais
esse status.

Conferido antes de trocar: nada no app assume que `open` implica responsavel
preenchido. `lead-inbound-handler.ts:785` ja testa `d.status === 'open' && d.assigned_to`
explicitamente, e nenhuma tela desreferencia `assigned_to` sem guarda. Efeito
colateral aceito: um negocio que estava em "Sem dono" antes do arquivamento
passa a contar em `dashboard.service.ts:359` (metrica de abertos) ao voltar.

`is_positive` NULO cai em `lost` de proposito: e o que o plpgsql da 062 faz,
porque `IF stage_record.is_positive THEN ... ELSE` trata NULL como falso.

Por que zerar `closed_at` ao voltar para `open`/`pending_assignment`: e o que o
trigger 062 faz no caso "Reabriu". Deixar uma data de fechamento em negocio
aberto contamina os filtros de periodo.

## 4. RESTRICAO CRITICA: indice unico de negocio ativo

`supabase/migrations/065_deals_unique_active_per_pipeline.sql` cria:

```sql
CREATE UNIQUE INDEX idx_deals_unique_active_per_pipeline
ON veltzy.deals (lead_id, pipeline_id)
WHERE status IN ('open', 'pending_assignment');
```

Cenario real que quebra: arquiva o negocio antigo do contato, o contato manda
mensagem e o inbound cria um negocio novo no mesmo pipeline, depois alguem
desarquiva o antigo. Duas linhas ativas para o mesmo `lead_id` + `pipeline_id`,
o Postgres devolve 23505 e o lote inteiro falha.

**A implementacao PRECISA prevenir isso antes do UPDATE.** Nao basta capturar o
erro: o usuario perde o lote todo por causa de uma linha.

Regras:
- Verificar conflito SO para os que voltam como `open`. Quem volta como
  `won`/`lost` nao entra no indice parcial e nunca conflita.
- ATENCAO: a consulta que levanta as chaves JA ativas continua filtrando
  `.in('status', ['open', 'pending_assignment'])`, com os dois. O que deixou de
  ser produzido e o status de DESTINO; um `pending_assignment` preexistente,
  criado pelo inbound, segue ocupando a chave e barrando o desarquivamento.
- Negocio com `pipeline_id` nulo nao conflita (o indice trata NULL como
  distinto).
- O conflito tambem pode ser DENTRO do proprio lote: dois arquivados do mesmo
  contato no mesmo pipeline, ambos voltando como ativos. O segundo tem que ser
  pulado igual.
- Conflito nao e erro: pula a linha, desarquiva o resto e informa quantas
  ficaram para tras.

## 5. IMPLEMENTACAO

### 5.1 `src/services/deals.service.ts`

Adicionar, logo depois de `bulkArchive` (linha 232):

```ts
export interface BulkUnarchiveResult {
  restored: number
  skippedConflict: number
}

export const bulkUnarchive = async (
  companyId: string,
  dealIds: string[],
): Promise<BulkUnarchiveResult>
```

Passos:

1. **Ler os candidatos.** Em lotes de `BATCH_SIZE` com o helper `chunk` ja
   existente: `select('id, lead_id, pipeline_id, stage_id, assigned_to')` de
   `deals`, `.in('id', batch)`, `.eq('company_id', companyId)`,
   `.eq('status', 'archived')`. O filtro por `archived` e o que torna a funcao
   idempotente: id que nao esta arquivado e simplesmente ignorado.
   Sem candidatos, retorna `{ restored: 0, skippedConflict: 0 }`.

2. **Ler as etapas.** Ids distintos e nao nulos de `stage_id`, em lotes:
   `select('id, is_final, is_positive')` de `pipeline_stages` filtrando por
   `company_id`. Montar `Map<string, { is_final, is_positive }>`.

3. **Calcular o status de volta** de cada candidato pela tabela da secao 3:
   etapa final decide `won`/`lost`, todo o resto e `open`. Como `assigned_to`
   nao e mais lido por ninguem, tirar o campo do `select` do passo 1 e da
   interface do candidato.

4. **Filtrar conflitos.** Montar o conjunto das chaves `lead_id::pipeline_id`
   ja ativas: uma consulta POR PIPELINE e por lote de leads,
   `select('lead_id, pipeline_id')` de `deals` com `.eq('company_id', companyId)`,
   `.eq('pipeline_id', X)`, `.in('lead_id', batch)` e
   `.in('status', ['open', 'pending_assignment'])`. O pipeline fixo no filtro nao
   e detalhe de gosto: em lote so por `lead_id` a resposta traz N linhas por lead
   (uma por pipeline) e pode encostar no teto de linhas do PostgREST, que trunca
   em SILENCIO, sem erro. Chave truncada e conflito nao detectado, ou seja o
   23505 que a secao 4 manda evitar. Com o pipeline fixo o proprio indice unico
   garante no maximo 1 linha por lead, entao cada resposta tem no maximo
   `BATCH_SIZE` linhas. Percorrer os candidatos que
   voltam como ativos: chave ja no conjunto conta em `skippedConflict` e sai;
   chave livre entra no conjunto (isso resolve o conflito interno ao lote) e
   segue. Candidato com `pipeline_id` nulo nunca e pulado.

5. **Gravar.** Agrupar os aprovados por status de destino e atualizar por grupo,
   em lotes de `BATCH_SIZE`, `.in('id', batch)` + `.eq('company_id', companyId)`.
   Para `won`/`lost`: `update({ status })`. Para `open`/`pending_assignment`:
   `update({ status, closed_at: null })`. Nao mexer em `stage_id`, senao o
   trigger 062 dispara e sobrescreve o status calculado aqui.

6. Retornar `{ restored, skippedConflict }`. `restored` conta linhas REALMENTE
   afetadas: usar `.select('id')` no update e somar `data?.length ?? 0`, nao o
   tamanho do lote enviado. Update barrado por RLS nao devolve erro, afeta zero
   linhas e passaria despercebido, inflando o numero que vai para o toast.

Multi-tenant: TODA leitura e TODA escrita levam `.eq('company_id', companyId)`,
sem excecao. Igual as demais funcoes bulk do arquivo.

### 5.2 `src/hooks/use-bulk-leads.ts`

Adicionar `useBulkUnarchiveDeals(onSuccess?: () => void)` logo depois de
`useBulkArchiveDeals` (linha 71), no mesmo formato:

- `mutationFn: async ({ dealIds }: { dealIds: string[] })` chama
  `dealsService.bulkUnarchive(companyId, dealIds)` e retorna o resultado.
- `onSuccess: (result)` chama `invalidateDealDependentQueries(queryClient)`
  e emite o toast. A ORDEM dos ramos importa, o caso vazio vem primeiro:
  - `restored === 0 && skippedConflict === 0`: `toast.info('Nenhum negócio para desarquivar')`.
    Acontece quando nenhum id selecionado estava de fato arquivado (alguem
    desarquivou em outra aba). Sem esse ramo na frente, o teste de
    `skippedConflict === 0` pega o caso e anuncia sucesso sem nada ter voltado.
  - `skippedConflict === 0`: `toast.success('Negócios desarquivados com sucesso')`
  - `restored === 0`: `toast.error('Nenhum negócio pôde ser desarquivado: o contato já tem negócio ativo neste pipeline')`
  - misto: `toast.warning(...)` dizendo quantos voltaram e quantos ficaram, com
    o motivo (contato ja tem negocio ativo no mesmo pipeline).
  Depois `onSuccess?.()`.
- `onError: () => toast.error('Erro ao desarquivar negócios')`.

### 5.3 `src/components/deals/bulk-unarchive-dialog.tsx` (novo)

Copia estrutural de `bulk-archive-dialog.tsx`, mesma prop interface
(`open`, `onClose`, `dealIds`, `onSuccess`, `mode?`), mesmo `AlertDialog`.

- Titulo: `Desarquivar {n} {label}{s}?`
- Descricao: explicar que os negocios voltam para a lista padrao e para o
  pipeline, e que os que estavam em etapa de ganho ou perda voltam com esse
  mesmo status.
- Botao: `Desarquivar`, estado pendente `Desarquivando...` com `Loader2`.
- Manter o padrao pt-BR do arquivo vizinho, incluindo o `label` derivado de
  `mode` ('negócio' | 'lead').

### 5.4 `src/components/deals/bulk-action-bar.tsx`

Substituir o calculo `allArchived` (linha 39) por:

```ts
const archivedSelected = selectedLeads.filter((l) => l.deal?.status === 'archived')
const hasSelection = selectedLeads.length > 0
// Selecao mista (arquivados + nao arquivados) esconde as DUAS acoes: nao da
// para prever o que "Arquivar" faria com o que ja esta arquivado, nem o que
// "Desarquivar" faria com o que esta ativo.
const canArchive = hasSelection && archivedSelected.length === 0
const canUnarchive = hasSelection && archivedSelected.length === selectedLeads.length
```

- `hasSelection` nao e redundante: `selectedLeads` e o cruzamento de
  `selectedIds` com `leads`, e pode ficar vazio se a selecao sobreviver a uma
  mudanca de filtro (desligar "Mostrar arquivados" com linhas arquivadas
  selecionadas). Com zero linhas cruzadas, nenhum dos dois botoes aparece.
- Botao Arquivar renderiza sob `canArchive` (era `!allArchived`).
- Botao Desarquivar renderiza sob `canUnarchive && canUnarchivePermission`,
  onde `canUnarchivePermission` segue a mesma regra de `canTransfer`
  (`admin`, `manager`, `super_admin`). Motivo: so admin/manager enxergam o
  toggle "Mostrar arquivados" em `deals.tsx:337`, entao a acao nao deve existir
  para seller nem que ele chegue nela por outro caminho.
- Icone: `ArchiveRestore` de `lucide-react`, `variant="outline"`, `size="sm"`,
  `className="gap-1.5"`, texto `Desarquivar`. Mesma posicao do Arquivar na
  barra (os dois nunca aparecem juntos).
- O dialog de desarquivar recebe `archivedSelected.map((l) => l.id)`, e nao
  `selectedArray`. Sao iguais quando o botao esta visivel, e passar a lista
  verificada evita mandar id de linha que sumiu do filtro.

## 6. PROIBIDO TOCAR

- `supabase/` inteiro. Esta feature nao tem migration.
- `src/stores/inbox.store.ts`, `src/styles/globals.css`.
- `src/pages/deals.tsx`: nao precisa de mudanca. Se voce achar que precisa,
  reporte antes de editar.
- A funcao `bulkArchive` existente e o `BulkArchiveDialog`: comportamento
  inalterado, so muda quando o botao aparece.
- Nao mexer em `dealsAsLeads` nem no `as never` de `deals.tsx`. Ver o risco na
  secao 7.

## 7. RISCO CONHECIDO: `deal.status` chega por `as never`

`deals.tsx:260` passa `leads={dealsAsLeads as never}`. O `as never` apaga a
checagem de tipo entre a tela e a `BulkActionBar`, entao o compilador NAO vai
acusar se `deal.status` deixar de ser preenchido. Hoje `dealsAsLeads` monta
`deal: { value, status, stage_name, pipeline_name }` (`deals.tsx:151`), e e dai
que sai o `l.deal?.status` da regra de visibilidade.

Consequencia pratica: a regra da secao 5.4 nao tem rede de tipo. Se `deal.status`
vier `undefined`, `archivedSelected` fica vazio e a barra mostra Arquivar para
tudo, silenciosamente. Isso NAO se prova com `tsc`, so com o criterio 3 da
secao 8.

## 8. CRITERIOS DE ACEITE

Falsificaveis, para o teste manual no browser em `/negocios` com o toggle
"Mostrar arquivados" LIGADO:

1. **So nao arquivados:** selecionar 2 linhas ativas. Aparece Arquivar, nao
   aparece Desarquivar.
2. **So arquivados:** selecionar 2 linhas arquivadas. Aparece Desarquivar, nao
   aparece Arquivar.
3. **Mistura:** selecionar 1 ativa + 1 arquivada. NAO aparece Arquivar e NAO
   aparece Desarquivar. Transferir, Mover Pipeline, Exportar e Excluir seguem
   aparecendo.
4. **Um so selecionado:** 1 linha arquivada mostra Desarquivar; 1 linha ativa
   mostra Arquivar.
5. **Desarquivar de etapa comum:** arquivado cuja etapa nao e final volta com
   status "Aberto", deixa de ficar com `opacity-60` na tabela e reaparece no
   kanban do pipeline dele.
6. **Desarquivar de etapa de ganho:** arquivado que estava em etapa final
   positiva volta como "Ganho", nao como "Aberto". Idem para etapa final
   negativa voltando "Perdido".
7. **Sem responsavel:** arquivado com responsavel vazio volta como "Aberto",
   NAO como "Aguardando atribuicao", e aparece na coluna da propria etapa do
   kanban, com o responsavel em branco. A coluna "Sem dono" nao ganha nenhum
   card novo por causa do desarquivamento.
8. **Conflito:** contato que ja tem negocio ativo em um pipeline e tem outro
   arquivado no MESMO pipeline. Desarquivar o arquivado nao quebra a tela, nao
   duplica o ativo, e o toast avisa que ficou de fora.
9. **Lote misto com conflito:** selecionar 3 arquivados sendo 1 em conflito.
   Os outros 2 voltam, o toast diz 2 desarquivados e 1 nao.
10. **KPIs:** os cards do topo (Total, Aberto, Fechado, Perdido) recalculam
    sozinhos apos o desarquivamento, sem F5.

## 9. PVO

Antes de declarar pronto, rodar e TRANSCREVER a saida (nao resumir como
"passou"):

1. `npx tsc -b` (com `-b`; `--noEmit` neste repo nao checa nada, o tsconfig e
   solution-style)
2. `npm run build`
3. `npx eslint` nos arquivos tocados, comparando com o baseline do merge-base
4. `git diff` mostrando mudanca real nos 4 arquivos da secao 5

O criterio 5 do PVO (teste no browser) e da Leticia: entregar a lista da secao 8
para ela conferir, nao declarar verde sozinha.

Commitar a Spec junto com o codigo. Arquivo de doc nao commitado nao entra no PR
e se perde.
