# Spec - Espacamento entre colunas da tabela (/deals)

**Branch base:** `develop` apos o merge da Fase 5A
**Escopo:** padding horizontal das celulas da tabela de negocios. Um arquivo.
**Origem:** reportado pela usuaria em 2026-08-04, com screenshot em 940px.

---

## 1. O defeito

As celulas da tabela **nao tem nenhum padding horizontal**:

```
:55   const thClass = 'pb-3 text-xs font-medium text-muted-foreground'   // so padding-bottom
      <td className="py-3 text-left">                                    // so padding vertical
```

As 9 colunas sao separadas **apenas** pela divisao percentual da largura (`w-[3%]`, `w-[26%]`, `w-[10%]`, `w-[15%]`, `w-[9%]`, `w-[11%]`, `w-[12%]`, `w-[10%]`, `w-[4%]`, somando 100%). Nao existe espaco entre elas: assim que o conteudo preenche a propria fatia, textos vizinhos se encostam.

Nao ha nenhuma ocultacao responsiva de coluna no arquivo. As 9 aparecem em qualquer viewport.

Abaixo de ~1200px de viewport a tabela e comprimida ate a largura minima do conteudo e o `overflow-x-auto` de `:336` passa a rolar. **`Pegando Fogo` e `Leticia Ribeiro` quebrando em duas linhas sao sintoma do mesmo aperto**, nao problema separado.

## 2. O trade-off, e por que a escolha foi a intermediaria

Padding aumenta a largura minima da tabela, entao o scroll horizontal passa a aparecer em telas **mais largas**. Larguras de texto calculadas, nao medidas em navegador:

| Padding | Largura minima | Scroll comeca abaixo de |
|---|---|---|
| nenhum (hoje) | ~900px | ~1200px |
| `px-2` | ~1044px | ~1350px |
| `px-3` | ~1116px | ~1420px |

**Decisao da usuaria em 2026-08-04: `px-2`**, o meio-termo. Nenhuma coluna e ocultada, nenhum dado some, e o custo em scroll e o menor dos que aliviam o aperto de verdade. Foi tambem a opcao mais barata de reverter caso nao resolva na pratica.

Rejeitadas: `px-3` com ocultacao de `Temperatura` e `Responsavel` abaixo de `2xl` (esconde dado e e decisao de produto maior que o problema), e `px-3` puro (levaria o scroll para 1420px, atingindo 1280px e 1336px).

## 3. A correcao

`px-2` em `th` e `td`, **mais `first:pl-0 last:pr-0`**.

O `first`/`last` nao e enfeite: sem ele a primeira e a ultima coluna ganhariam um recuo de 8px que desalinharia a tabela do resto do conteudo do card, e gastaria 16px de largura sem beneficio. Com ele, a largura minima cai de ~1044px para **~1028px**, e o espacamento so aparece **entre** colunas, que e onde ele foi pedido.

**Nota de borda, e ela importa para a verificacao:** em 1336px a area util da tabela e de ~1032px (1336 menos a sidebar de 256px e o `p-6` de 48px) contra os ~1028px de minimo estimado. **A folga e de ~4px, ou seja, praticamente zero.** Nessa largura especifica so o navegador decide se aparece uma barra curta. Nao tratar como defeito se aparecer: e o limite conhecido e aceito da escolha por `px-2`.

## 4. Mudancas, todas em `src/pages/deals.tsx`

```
:55  DE:    const thClass = 'pb-3 text-xs font-medium text-muted-foreground'
     PARA:  const thClass = 'pb-3 px-2 first:pl-0 last:pr-0 text-xs font-medium text-muted-foreground'
```

Acrescentar, logo abaixo, o par do `td`:

```ts
const tdClass = 'py-3 px-2 first:pl-0 last:pr-0 text-left'
```

Aplicar `tdClass` nas **9 celulas de dados**, preservando as classes extras de cada uma via `cn`:

| Linha | DE | PARA |
|---|---|---|
| `:386` | `className="py-3 text-left"` (mantem o `onClick`) | `className={tdClass}` |
| `:394` | `className="py-3 text-left"` | `className={tdClass}` |
| `:403` | `className={cn('py-3 text-left font-semibold', dealValueColor[deal.status])}` | `className={cn(tdClass, 'font-semibold', dealValueColor[deal.status])}` |
| `:408` | `className="py-3 text-left"` | `className={tdClass}` |
| `:428` | `className="py-3 text-left"` | `className={tdClass}` |
| `:435` | `className="py-3 text-left"` | `className={tdClass}` |
| `:445` | `className="py-3 text-left text-xs"` | `className={cn(tdClass, 'text-xs')}` |
| `:450` | `className="py-3 text-left text-xs text-muted-foreground whitespace-nowrap"` | `className={cn(tdClass, 'text-xs text-muted-foreground whitespace-nowrap')}` |
| `:457` | `className="py-3 text-left"` | `className={tdClass}` |

**A celula de estado vazio (`:470`, `colSpan={9}`) NAO muda.** Ela e `py-12 text-center` e ocupa a linha inteira: `text-left` e `first:pl-0` nao fazem sentido ali e `px-2` nao muda nada visivelmente.

## 5. Fora do escopo

- **Nenhuma coluna e ocultada** e **nenhuma largura percentual muda**. Se o aperto persistir em telas medias, a proxima passada avalia ocultar colunas, e isso e decisao de produto.
- **O `overflow-x-auto` de `:336` fica como esta.** Ele ja funciona; o problema nunca foi a existencia do scroll.
- **Nada de `min-w-` na tabela.** Foi considerado para tornar o scroll deterministico, mas fixaria a largura minima em um numero estimado e nao medido. Fora desta passada.
- **Nada nos KPI cards, no `Breakdown`, no `/inbox`, em `supabase/` ou `src/styles/`.**

## 6. Verificacao

### 6.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida |
| 2 | `npm run build` | sem erro |
| 3 | `npm run lint` | 81 problems (67 errors, 14 warnings). Reportar tambem **se `deals.tsx` aparece e com quais achados**: ele ja carrega 2 warnings preexistentes de `exhaustive-deps` (`pipelineMap` e `stageMap`), que devem continuar sendo exatamente 2 |
| 4 | `git status` | **um unico arquivo de codigo**, `src/pages/deals.tsx`, mais esta Spec |

### 6.2 Manual

| # | Verificacao | Viewport |
|---|---|---|
| 5 | **As colunas nao se encostam mais**, que e o pedido original | 940px |
| 6 | A primeira e a ultima coluna continuam alinhadas com a borda do conteudo do card, sem recuo | 940px e 1440px |
| 7 | **O caso de borda.** Conferir se aparece barra de rolagem horizontal. Se aparecer uma barra curta, e o limite conhecido da escolha por `px-2`, **nao e defeito** | **1336px** |
| 8 | Sem scroll horizontal, e colunas com respiro | 1440px e 1920px |
| 9 | `Pegando Fogo` e nomes de responsavel quebram menos em duas linhas do que antes | 940px |
| 10 | O estado vazio (nenhum negocio) continua centralizado na linha inteira | qualquer |
| 11 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie | 1440px |
