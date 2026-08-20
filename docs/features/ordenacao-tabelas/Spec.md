# Spec: Ordenacao nas tabelas de Contatos e Negocios

> **Telas:** `/contatos` (`src/pages/contatos.tsx`) e `/negocios` (`src/pages/deals.tsx`)
> **Status:** Aprovada, aguardando implementacao
> **Migration:** NENHUMA. Esta Spec nao toca em `supabase/`.
> **Branch:** `feat/desarquivar-negocio`, a MESMA do desarquivamento. Ver secao 2.

---

## 1. O QUE E

Um botao pequeno ao lado do rotulo de cada coluna ordenavel, nas duas tabelas.
Clique alterna crescente, decrescente e volta a ordem padrao. Uma coluna
ordenada por vez.

## 2. BRANCH

Esta frente fica na `feat/desarquivar-negocio`, junto do desarquivamento e da
remocao de colunas que ja estao no commit `33d1934`. Decisao da Leticia em
20/08/2026, revertendo a orientacao anterior desta Spec, que mandava abrir
`feat/ordenacao-tabelas` empilhada. Branch propria NAO deve ser criada, e a que
chegou a existir foi apagada sem nunca ter commit proprio.

Consequencia pratica: um PR so, contendo desarquivamento, remocao de colunas e
ordenacao. Nao existe mais dependencia de ordem entre PRs.

O que continua valendo do raciocinio antigo: sair de `develop` seria errado, e
por isso a base e o `33d1934`. Aquele commit ainda nao esta na develop e ja
alterou as DUAS tabelas que esta Spec edita (tirou Responsavel de Contatos e
Temperatura de Negocios). Editar a partir de develop pegaria o cabecalho antigo
e garantiria conflito nos dois arquivos.

## 3. ESCOPO

**Entra:**
1. Peca compartilhada de ordenacao (lib pura + hook + botao), com teste unitario
   da lib.
2. Fiacao nas duas tabelas, nas colunas listadas na secao 5.

**Nao entra (nao implementar):**
- Ordenacao no servidor, `order()` no PostgREST, mudanca em service ou hook de
  dados. A ordenacao e client-side sobre as linhas ja carregadas e filtradas,
  igual a busca e aos filtros que as duas telas ja fazem em memoria.
- Persistir a ordem escolhida (localStorage, URL, store). O estado e local da
  pagina e volta ao padrao ao sair dela.
- Ordenar por mais de uma coluna ao mesmo tempo.
- Cabecalho inteiro clicavel. A Leticia pediu um botao ao lado do rotulo; o
  clique fica no botao, nao no `<th>`.
- Tabelas de outras telas (dashboard, admin, inbox).

## 4. PECAS COMPARTILHADAS

### 4.1 `src/lib/table-sort.ts` (novo)

```ts
export type SortDirection = 'asc' | 'desc'
export interface SortState<K extends string = string> { key: K; direction: SortDirection }
/** Valor comparavel de uma celula. `null` e `''` significam "vazio". */
export type SortValue = string | number | null | undefined

export const sortRows = <T>(
  rows: T[],
  getValue: (row: T) => SortValue,
  direction: SortDirection,
): T[]
```

Regras, todas obrigatorias:

- **Nao muta.** Copia antes de ordenar (`[...rows].sort(...)`), senao o array
  memoizado da tela e reordenado no lugar e o React perde a referencia.
- **Vazio sempre por ultimo, nas DUAS direcoes.** Vazio e `null`, `undefined` e
  string vazia. Inverter a direcao NAO leva os vazios para o topo: quem ordena
  por Valor quer ver valores, nao uma pilha de tracinhos.
- **`0` NAO e vazio.** Em Contatos, `dealCount` e `ltv` valem 0 para contato sem
  negocio, e 0 e um numero de verdade que participa da ordem. Testar
  `value == null || value === ''`, nunca `!value`.
- **Texto compara com `localeCompare('pt-BR', { sensitivity: 'base', numeric: true })`.**
  `sensitivity: 'base'` ignora acento e caixa (senao "Ávila" cai depois de
  "Zulmira"). `numeric: true` ordena numero embutido em texto de forma humana
  ("Etapa 2" antes de "Etapa 10"), e e disso que a coluna Pipeline · etapa
  depende na secao 5.2.
- **Numero compara por subtracao.** Nunca converter numero para string.
- **Empate preserva a ordem de entrada.** `Array.prototype.sort` e estavel por
  especificacao desde ES2019, entao nao inventar desempate: os empatados devem
  continuar na ordem que a query devolveu.

### 4.2 `src/hooks/use-table-sort.ts` (novo)

```ts
export const useTableSort = <K extends string>(): {
  sort: SortState<K> | null
  toggle: (key: K) => void
}
```

Ciclo de tres estados ao clicar na MESMA coluna:
`null -> asc -> desc -> null`. Clicar em uma coluna DIFERENTE comeca em `asc`
naquela coluna e zera a anterior. `null` significa ordem padrao, a que veio da
query, e ela precisa ser alcancavel: e como o usuario desfaz a ordenacao.

### 4.3 `src/components/shared/sort-button.tsx` (novo)

```tsx
interface SortButtonProps<K extends string> {
  columnKey: K
  /** Rotulo da coluna, usado no title e no aria-label. */
  label: string
  sort: SortState<K> | null
  onToggle: (key: K) => void
}
```

- Botao pequeno, alinhado ao rotulo: `variant="ghost"`, altura e largura de
  icone (`h-5 w-5 p-0`), icone `h-3.5 w-3.5`, `shrink-0`.
- Icones do `lucide-react`: inativo `ArrowUpDown` em
  `text-muted-foreground/40`; `asc` `ArrowUp` em `text-primary`; `desc`
  `ArrowDown` em `text-primary`. So a coluna ativa fica colorida.
- `title` e `aria-label`: `Ordenar por {label}` quando inativo,
  `{label}: crescente` e `{label}: decrescente` quando ativo.
- Cores por token semantico, nunca cor direta (regra do CLAUDE.md).
- O botao NAO recebe o clique da linha: ele mora no `<thead>`, fora das `<tr>`
  clicaveis, entao nao precisa de `stopPropagation`.

Uso no cabecalho, nas duas telas:

```tsx
<th className={cn(thClass, 'text-left w-[25%]')}>
  <span className="inline-flex items-center gap-1">
    Contato
    <SortButton columnKey="contato" label="Contato" sort={sort} onToggle={toggle} />
  </span>
</th>
```

## 5. COLUNAS ORDENAVEIS

O acessor de cada coluna tem que devolver o que a CELULA mostra. Coluna que
ordena por um campo diferente do que esta escrito na tela e bug, nao recurso.

### 5.1 `/contatos`, sobre o array `rows` (ja filtrado por busca, origem e temperatura)

| key | Rotulo | Valor ordenado |
|-----|--------|----------------|
| `contato` | Contato | `leadDisplayName(c.name, c.phone ?? '')`, o mesmo texto do `IdentityCell` |
| `canal` | Canal | `c.lead_sources?.name ?? c.whatsapp_instance_name ?? null` |
| `negocios` | Negocios | `c.dealCount` (numero, 0 participa) |
| `valor` | Valor total | `c.ltv` (numero, 0 participa) |
| `temperatura` | Temperatura | posto numerico `cold 0, warm 1, hot 2, fire 3`; ausente vira `null` |

Coluna **Chat** nao ganha botao.

Temperatura ordena pela ESCALA, nunca pelo rotulo em alfabeto: "Frio, Morno,
Quente" alfabetico daria Frio, Morno, Quente por acaso, mas com `fire` no meio a
ordem alfabetica mente. O posto vem da ordem do type
`LeadTemperature = 'cold' | 'warm' | 'hot' | 'fire'`.

A ordenacao entra DEPOIS do filtro, sobre `rows`, e o `<tbody>` passa a mapear o
array ordenado.

### 5.2 `/negocios`, sobre o array `visibleDeals` (ja filtrado por pipeline, periodo, arquivados e busca)

| key | Rotulo | Valor ordenado |
|-----|--------|----------------|
| `negocio` | Negocio | `identityTitle`, ou seja `deal.name?.trim() || leadDisplayName(...)`, o mesmo titulo da celula |
| `valor` | Valor | `deal.value` (numero; `null` vai para o fim) |
| `pipeline` | Pipeline · etapa | composto `` `${pipeline.name} ${stage.position}` ``; sem pipeline vira `null` |
| `status` | Status | posto numerico, secao 5.3 |
| `responsavel` | Responsavel | `(deal.profiles as { name?: string } \| null)?.name ?? null` (sem responsavel vai para o fim) |
| `data` | Data | timestamp numerico da MESMA regra da celula: `won`/`lost` com `closed_at` usam `closed_at`, o resto usa `created_at` |

Checkbox e **Chat** nao ganham botao.

Sobre `pipeline`: o composto ordena primeiro por nome do pipeline e depois pela
POSICAO da etapa no funil, nao pelo nome dela. Ordenar etapa em alfabeto
embaralharia o funil ("Fechado" antes de "Novo Lead"). O `numeric: true` do
`localeCompare` (secao 4.1) e o que faz `position` 2 vir antes de 10 sem
padding.

Sobre `data`: a regra tem que espelhar a celula, que hoje mostra `fech. <data>`
com `closed_at` para ganho e perdido e `created_at` para o resto. Existe um
`dealRefDate` equivalente em `dashboard.service.ts:289`, mas ele e privado do
service e serve ao recorte do dashboard; NAO exportar de la nem importar service
dentro de pagina. Declarar a funcao local na propria `deals.tsx`, junto do mapa
de colunas, com comentario dizendo que ela espelha a celula.

A ordenacao entra DEPOIS de `visibleDeals` e alimenta so o `<tbody>`. Os cards
de KPI do topo leem `deals`, nao `visibleDeals`, entao nao podem mudar de valor
ao ordenar.

### 5.3 Posto de status em `/negocios`

Ordem crescente, do mais ativo ao mais frio:
`pending_assignment 0, open 1, won 2, lost 3, archived 4`.
Nao usar a ordem do type nem alfabetica. Definir o mapa como
`Record<DealStatus, number>` para o compilador cobrar todos os status se um novo
for criado.

## 6. INTERACAO COM O QUE JA EXISTE

- **Selecao em massa em /negocios:** `selectedIds` e um `Set` de id, indiferente
  a ordem. Ordenar NAO pode limpar a selecao. `toggleSelectAll` opera sobre
  `visibleDeals`, cujo conjunto de linhas nao muda ao ordenar, so a ordem.
- **Barra de acoes:** nada muda.
- **Busca e filtros:** continuam antes da ordenacao no encadeamento. Trocar o
  filtro com uma coluna ordenada mantem a ordenacao aplicada ao novo conjunto.
- **Skeleton, erro e estado vazio:** as tres tabelas ja tratam `isLoading`,
  `isError` e lista vazia. O botao de ordenar continua renderizado no cabecalho
  nesses estados, e clicar nele com a lista vazia nao pode quebrar.

## 7. LIMITACAO CONHECIDA (registrar, nao corrigir aqui)

As duas telas ordenam o que ja esta em memoria, e as duas ja chegam capadas
hoje: `/negocios` pede `limit: 500` explicito, e `/contatos` usa `limit: 0`, que
NAO significa ilimitado no PostgREST, e sim sem `range`, caindo no teto padrao
do servidor, que trunca em silencio.

Consequencia: em base grande, ordenar por Valor mostra o maior valor DO QUE
CARREGOU, nao da empresa. Nao e regressao, e o mesmo teto que a busca e os
filtros dessas telas ja tem. Corrigir e paginacao no servidor, frente propria, e
NAO entra aqui.

## 8. TESTE UNITARIO

`src/lib/table-sort.test.ts` (novo), vitest, ja usado no repo
(`src/lib/deals-period-filter.test.ts` serve de modelo). Casos minimos:

1. `asc` e `desc` invertem a ordem dos valores preenchidos.
2. Vazio (`null`, `undefined`, `''`) fica por ultimo em `asc` E em `desc`.
3. `0` ordena como numero, nao como vazio: `[0, 5, null]` em `asc` da `0, 5, null`.
4. Texto ignora acento e caixa: `['ávila', 'Banana', 'Ana']` em `asc` da
   `Ana, ávila, Banana`.
5. Composto com numero: `['Vendas 2', 'Vendas 10']` em `asc` mantem `2` antes de `10`.
6. Empate preserva a ordem de entrada.
7. `sortRows` nao muta o array recebido.

## 9. PROIBIDO TOCAR

- `supabase/` inteiro.
- `src/services/` e os hooks de dados (`use-contacts.ts`, `use-deals.ts`). A
  ordenacao nao chega perto da camada de dados.
- `dashboard.service.ts`, incluindo exportar o `dealRefDate`.
- `src/stores/`, `src/styles/globals.css`.
- Colunas, filtros, busca e KPIs existentes das duas telas: so o cabecalho ganha
  botao e so o array do `<tbody>` passa a ser o ordenado.

## 10. CRITERIOS DE ACEITE

1. **Botao em toda coluna ordenavel:** `/contatos` mostra botao em Contato,
   Canal, Negocios, Valor total e Temperatura, e NAO mostra em Chat.
   `/negocios` mostra em Negocio, Valor, Pipeline · etapa, Status, Responsavel e
   Data, e NAO mostra no checkbox nem em Chat.
2. **Ciclo de tres estados:** primeiro clique ordena crescente com seta para
   cima, segundo decrescente com seta para baixo, terceiro volta a ordem
   original da tela.
3. **Uma coluna por vez:** ordenar por Valor e depois clicar em Data deixa so
   Data colorida, e a ordem passa a ser por data.
4. **Vazio no fim nos dois sentidos:** em `/negocios`, ordenar por Valor
   crescente e depois decrescente; negocio sem valor fica no fim das DUAS vezes.
   Mesma coisa em Responsavel com "Sem responsavel".
5. **Zero nao e vazio:** em `/contatos`, ordenar por Negocios crescente coloca os
   contatos com 0 negocio no comeco, e nao no fim junto dos vazios.
6. **Acento:** ordenar Contato crescente coloca nome comecado por A com acento
   junto dos outros A, nao no fim da lista.
7. **Temperatura pela escala:** ordenar Temperatura crescente da Frio, Morno,
   Quente, Pegando fogo, nessa ordem.
8. **Etapa pelo funil:** ordenar Pipeline · etapa agrupa por pipeline e, dentro
   dele, segue a ordem do funil, nao o alfabeto das etapas.
9. **Data segue a celula:** ordenar Data decrescente coloca no topo a maior data
   ESCRITA na coluna, inclusive nas linhas que mostram "fech. <data>".
10. **Selecao sobrevive:** selecionar 2 negocios, ordenar por outra coluna: a
    barra continua dizendo 2 selecionados e os mesmos 2 seguem marcados.
11. **KPIs imoveis:** os cards do topo de `/negocios` nao mudam de numero ao
    ordenar.
12. **Lista vazia:** com busca que nao acha nada, clicar em ordenar nao quebra a
    tela.

## 11. PVO

1. `npx tsc -b` (com `-b`; `--noEmit` neste repo nao checa nada)
2. `npm run build`
3. `npm run test:run` (a lib nova tem teste; os testes existentes continuam verdes)
4. `npx eslint` nos arquivos tocados, contra o baseline medido ANTES da primeira
   edicao
5. `git diff` mostrando mudanca real nos 6 arquivos

O teste no browser e da Leticia: entregar a lista da secao 10. Nao commitar sozinha: montar a lista de arquivos a
stagear, com esta Spec nomeada, e pedir o commit a ela.
