# Spec - Responsividade Mobile, Fase 4 (telas medias)

**Branch:** `feature/responsividade-mobile-telas-medias`
**Base:** `develop` em `bacfb4b` (Fases 1, 2 e 3 mergeadas nos PRs #142, #143 e #144)
**Escopo:** frontend puro. Sem migration, sem schema, sem Edge Function.
**PRD de origem:** `docs/PRD-responsividade.md`, secao 4, Fase 4 (itens 11, 12 e 13), mais a secao 1.6 (tabelas) e as linhas de complexidade "Media" da secao 2.

Telas em escopo: `/deals`, `/tarefas`, `/` (dashboard).

---

## 0. Resumo executivo

A reverificacao contra a `develop` atual **derrubou tres das quatro premissas do PRD** para esta fase e **encontrou uma quebra que o PRD nao previa**. O saldo:

| Frente do PRD | Veredito apos medicao |
|---|---|
| 1. `overflow-x-auto` nas tabelas de `/deals` e `result-step` | **Premissa falsa.** As duas ja estao cobertas. Uma explicitacao opcional de custo zero |
| 2. Legibilidade Recharts em 360px | **3 quebras reais** em 3 arquivos, uma delas exige decisao de design |
| 3a. Altura fluida do `/tarefas` | **Quebra real**, mas resolvida por 1 prefixo de breakpoint, sem mudanca estrutural |
| 3b. Decisao de UX das colunas de status | **Ja decidida no codigo desde 28/abr.** Nao ha decisao a tomar, ha uma a validar |
| **(novo)** Bloco de botoes de periodo | **2 quebras** nao previstas, em `/dashboard` e `/deals` |

**Total: 6 quebras confirmadas, 1 decisao de design a aprovar, 1 explicitacao opcional, 7 arquivos de codigo.**

Nenhuma mudanca estrutural de JSX se provou necessaria alem de uma, no `leads-by-source-chart`, justificada na secao 4.3.

---

## 1. Metodo de medicao

Mesma metodologia da Spec da Fase 3, para os numeros serem comparaveis entre fases.

**Larguras disponiveis, em viewport de 360px (o pior dos tres alvos):**

| Nivel | Conta | Disponivel |
|---|---|---|
| Viewport | | 360px |
| Raiz da pagina (`p-4`, Fase 2) | 360 - 32 | **328px** |
| Dentro de `glass-card p-5` | 328 - 40 | **288px** |
| Dentro de `bg-card p-4` | 328 - 32 | **296px** |
| Dentro de `bg-card p-3` | 328 - 24 | **304px** |
| Dentro de um `Dialog` em 390px (`max-w-[calc(100vw-2rem)]` + `p-6`, Fase 2) | 390 - 32 - 48 | **310px** |

**Largura de texto:** contagem de caracteres vezes a media do glifo.

| Tamanho | Media por caractere |
|---|---|
| `text-sm` (14px) | 7,3px |
| `text-xs` (12px) | 6,2px |
| `text-[10px]` | 5,2px |
| SVG `fontSize={12}` | 6,2px |
| SVG `fontSize={11}` | 5,7px |

**Margem de erro: cerca de 10%.** Achados que estouram por mais de 20% sao afirmados como quebra. Entre 10% e 20%, afirmo como quebra mas registro a folga. Abaixo de 10%, trato como risco marginal. Nenhum caso marginal foi inflado para virar quebra nesta Spec.

**Elementos que nao encolhem:** `Button` e `TabsTrigger` tem `whitespace-nowrap`. Os botoes de periodo do `/dashboard` e do `/deals` sao `<button>` cru sem `whitespace-nowrap`, mas os rotulos ("Hoje", "Semana", "Mes", "Total") sao **palavras unicas**, e quebra de linha so ocorre em espaco. Na pratica o `min-content` deles tambem e a largura cheia.

**Sobre `100vh` no mobile:** os navegadores mobile resolvem `vh` contra a viewport grande (com a barra de URL recolhida), entao `100vh` e tipicamente 8% a 12% maior que a area visivel. Isso importa na secao 5.

---

## 2. O que as Fases 1, 2 e 3 ja resolveram nestas telas

O PRD escreveu a Fase 4 antes de as tres primeiras existirem. Boa parte do que ele previu ja esta feito:

| Ja resolvido | Onde | Fase |
|---|---|---|
| Sidebar vira drawer abaixo de 1024px, topbar `h-14` no mobile | shell | 1 |
| `p-4 sm:p-6` em `/deals`, `/tarefas`, `/dashboard` | `deals.tsx`, `tarefas.tsx:240`, `dashboard.tsx:153` | 2 |
| Os 3 grids de `/deals` | `deals.tsx:259`, `:268`, `:283`, `:293`, `:337`, todos `grid-cols-1 sm:grid-cols-3` | 2 |
| O skeleton do `dashboard.tsx:128` | virou `flex flex-col gap-1.5`, nao e mais grid | 2 |
| Grids do dashboard | `:205`, `:222` (`md:2 lg:3`), `:336` (`md:2`), `:345` (`lg:2`) | 2 |
| Modais com `max-h-[90dvh]`, `max-w-[calc(100vw-2rem)]` e scroll interno | `dialog.tsx` | 2 |
| Header do `/deals` com `flex-wrap` | `deals.tsx:177` | ja existia |
| Filtros do `/tarefas` com `flex-wrap` | `tarefas.tsx:281` | ja existia |
| Colunas de status do `/tarefas` empilhadas no mobile | `tarefas.tsx:349`, `grid-cols-1 lg:grid-cols-3` | ja existia (28/abr) |
| `overflow-x-auto` na tabela de `/deals` | `deals.tsx:364` | ja existia (25/abr) |

**Confirmei linha a linha: nao ha nenhum `grid-cols-N` sem prefixo de breakpoint nas tres telas.** Nenhuma regressao da Fase 2. O unico grid sem `grid-cols-1` no mobile e `monthly-comparison-grid.tsx:151` e `:160` (`grid-cols-2 lg:grid-cols-4`), que **e uma escolha deliberada e nao uma omissao**: 2 colunas de mini-graficos comparativos em mobile e uma densidade defensavel. Nao o toco por reflexo; ele reaparece na secao 4.2 por outro motivo.

---

## 3. Frente 1 - Tabelas: a premissa do PRD esta errada

O PRD (secao 1.6) afirma que 6 das 8 tabelas tem `overflow-x-auto` e que `deals.tsx` e `result-step.tsx` nao tem. **Reverifiquei as 8 e a afirmacao nao se sustenta.**

### 3.1 `src/pages/deals.tsx:364` - SEM ACAO

```tsx
:364  <div className="overflow-x-auto">
:365    <table className="w-full text-sm">
```

O wrapper **ja existe**. `git blame` aponta o commit `c9f3836f`, de **25/04/2026**, ou seja, tres semanas antes de a primeira fase de responsividade comecar. O PRD errou o inventario.

Registro a medida que confirma que o wrapper funciona, porque `table w-full` dentro de um container com scroll merece checagem: a tabela tem 9 colunas com largura em porcentagem (`w-[3%]` a `w-[26%]`). Porcentagem nao cria piso de largura, entao quem define o piso e o `min-content` das celulas. Somando os cabecalhos sozinhos, em `text-xs uppercase`:

| Coluna | Rotulo | Largura minima |
|---|---|---|
| checkbox | | 16px |
| Negocio | 7 chars | 43px |
| Valor | 5 | 31px |
| Pipeline · etapa | 16 | 99px |
| Status | 6 | 37px |
| Temperatura | 11 | 68px |
| Responsavel | 11 | 68px |
| Data | 4 | 25px |
| Chat | 4 | 25px |
| padding das celulas | 9 x ~16 | 144px |
| **soma** | | **556px** |

**556px de piso contra 288px disponiveis** (a tabela vive dentro de `glass-card p-5`). A tabela estoura o `w-full`, o `overflow-x-auto` ativa e rola. **E exatamente o comportamento desejado pelo criterio 12 do PRD.** Sem acao.

### 3.2 `src/components/pipeline/import-steps/result-step.tsx:57` - explicitacao opcional

```tsx
:57  <div className="max-h-[200px] overflow-y-auto rounded-lg border scrollbar-minimal">
:58    <table className="w-full text-xs">
```

O PRD esta certo que **nao ha `overflow-x-auto` escrito aqui**. Mas ha uma regra de CSS que muda a conclusao.

Pela CSS Overflow Module Level 3: quando um dos eixos de `overflow` recebe um valor diferente de `visible` e o outro fica em `visible`, **o `visible` computa para `auto`**. Como a linha 57 declara `overflow-y: auto` e nao declara `overflow-x`, o `overflow-x` computado **ja e `auto`**. O container **ja rola horizontalmente hoje**, em todos os navegadores modernos.

A medida, para saber se isso chega a ser exercitado. O `ResultStep` vive no `import-leads-modal.tsx:106`, cujo `DialogContent` e `sm:max-w-2xl`, entao em 390px vale o teto do `dialog.tsx`: **310px uteis**. A tabela tem 3 colunas em `text-xs` com `px-3` (24px por celula):

| Coluna | Conteudo tipico | Largura |
|---|---|---|
| Linha | numero, 3 chars | 19 + 24 = 43px |
| Status | "Pulado", 6 chars | 37 + 24 = 61px |
| Motivo | "Lead ja existe com este telefone", 32 chars | 198 + 24 = 222px |
| **soma** | | **326px** |

**326px contra 310px: 5% acima.** Marginal pela minha propria margem de erro, e o motivo e texto livre vindo do servico de importacao, entao pode ser bem mais longo que o exemplo. O `overflow-x` implicito absorve.

**Proposta:** adicionar `overflow-x-auto` explicito.

```
:57  DE:    <div className="max-h-[200px] overflow-y-auto rounded-lg border scrollbar-minimal">
     PARA:  <div className="max-h-[200px] overflow-x-auto overflow-y-auto rounded-lg border scrollbar-minimal">
```

**Sejamos precisos sobre o que essa mudanca e e o que ela nao e.** Ela **nao corrige bug nenhum**: o comportamento em runtime hoje ja e identico ao de depois. E uma explicitacao, e recomendo por dois motivos concretos: torna a tabela auditavel contra o criterio 12 do PRD ("todas as 8 tabelas estao em container com `overflow-x-auto`") sem que o auditor precise conhecer a regra de computacao do CSS, e protege o comportamento caso alguem futuramente troque o `max-h`/`overflow-y` por outra estrategia de altura, o que hoje derrubaria o scroll horizontal junto, sem aviso.

Se a decisao for nao mexer, **nada quebra**. Registro como a unica mudanca desta Spec que e dispensavel.

### 3.3 As outras 6 tabelas - SEM ACAO

Verificadas uma a uma na `develop` atual:

| # | Arquivo | Wrapper | Linha |
|---|---|---|---|
| 1 | `src/components/admin/sellers-tab.tsx` | `overflow-x-auto` | `:81` |
| 2 | `src/components/dashboard/seller-performance-table.tsx` | `overflow-x-auto` | `:39` |
| 3 | `src/components/pipeline/import-steps/preview-step.tsx` | `overflow-x-auto rounded-lg border` | `:79` |
| 4 | `src/components/sdr-v2/dashboard/SdrV2Dashboard.tsx` | `overflow-x-auto` | `:87` |
| 5 | `src/components/super-admin/companies-dashboard.tsx` | `overflow-x-auto` | `:36` |
| 6 | `src/pages/contatos.tsx` | `overflow-x-auto` | `:140` |

**Veredito da Frente 1: 8 de 8 tabelas cobertas. O criterio 12 do PRD ja esta satisfeito hoje.**

---

## 4. Frente 2 - Dashboard: graficos Recharts em 360px

Os 4 componentes que renderizam Recharts em `/` foram abertos e medidos. **Todos usam `ResponsiveContainer` com `minWidth={1} minHeight={1}`**, ou seja, nenhum tem largura minima fixa empurrando scroll. O eixo do problema nao e o container, e o conteudo desenhado dentro dele.

### 4.1 `metrics-line-chart.tsx:57` - `interval={0}` impede o auto-ocultamento dos ticks

```
:57  DE:    interval={0}
     PARA:  interval="preserveStartEnd"
```

O `<MetricsLineChart>` e renderizado em `dashboard.tsx:357`, fora de grid, entao ocupa a largura toda: 328px, menos o `p-4` do card, **296px**. Sem `YAxis` visivel (`hide` nas duas), com `margin={{ right: 8, left: -16 }}`, o plot fica com cerca de **304px**.

Os rotulos do eixo X vem de `dashboard.service.ts:354`, no formato `${monthNames[m]}/${yy}`, ou seja **"mai/26", 6 caracteres**. A `fontSize: 11` isso da **34px por rotulo**.

O numero de rotulos e o `months`, que e o state `monthlyRange` do `dashboard.tsx:142`. Ele comeca em 6, mas o `<select>` do `monthly-comparison-grid.tsx:139` oferece **3, 6 e 12**, e os dois componentes compartilham o mesmo state. Entao 12 e alcancavel pelo usuario em dois cliques.

| `months` | Rotulos | Largura pedida | Plot | Situacao |
|---|---|---|---|---|
| 3 | 3 x 34 | 102px | 304px | folgado |
| 6 | 6 x 34 | 204px | 304px | cabe |
| 12 | 12 x 34 | **408px** | 304px | **34% acima, sobrepoe** |

Normalmente o Recharts resolveria isso sozinho, ocultando rotulos intermediarios que colidem. **`interval={0}` desliga exatamente esse mecanismo** e forca todos os ticks. Com 12 meses em 360px os rotulos se sobrepoem e o eixo fica ilegivel, violando o criterio 14 do PRD.

`interval="preserveStartEnd"` devolve o auto-ocultamento ao Recharts, garantindo que o primeiro e o ultimo mes sempre aparecam.

**Nao regride o desktop:** em 1280px o plot tem cerca de 1000px, e 12 x 34 = 408px cabe com folga de 2,4x, entao o Recharts nao oculta nada e o eixo continua mostrando os 12 meses, como hoje. E um ajuste que so age quando o espaco falta.

### 4.2 `monthly-comparison-grid.tsx` - os rotulos de variacao se sobrepoem (DECISAO DE DESIGN)

Este e o unico item da Spec que **nao e ajuste mecanico** e que peco aprovacao explicita antes de implementar.

**A medida.** O grid e `grid-cols-2 lg:grid-cols-4 gap-3` (`:151` e `:160`). Em 360px, com 2 colunas e `gap-3`:

```
card    = (328 - 12) / 2                     = 158px
plot    = 158 - 24 (p-3) - 32 (YAxis width) + 24 (margin left -24) - 2 (right)
        = 124px
```

Cada `MiniChart` desenha, via `LabelList` + `CustomLabel` (`:23` a `:50`), um rotulo de variacao percentual centralizado **acima de cada barra**, a partir do indice 1, em `fontSize={11}`:

| `months` | Barras | Largura por barra | Rotulo "+12%" (5 chars) | Resultado |
|---|---|---|---|---|
| 6 (default) | 6 | 124 / 6 = **20,7px** | **28,5px** | transborda 8px, sobrepoe os vizinhos |
| 12 | 12 | 124 / 12 = **10,3px** | 28,5px | sobrepoe quase 3x, ilegivel |

**No default de 6 meses ja sobrepoe, em 38% acima do espaco por barra.** Nao e um caso de borda: e o estado inicial da tela em qualquer celular.

O eixo X do mesmo grafico **nao tem esse problema** e nao precisa de acao: ele nao usa `interval={0}`, entao o Recharts oculta os rotulos que nao cabem. Com 34px por rotulo em 124px, mostra 3 dos 6. Degrada, mas nao sobrepoe.

**Recomendacao: suprimir o rotulo de variacao abaixo de 1024px.**

```
Importar o hook ja existente da Fase 1:
    import { useIsMobile } from '@/hooks/use-mobile'

Dentro de MiniChart (:70), antes do return:
    const isMobile = useIsMobile()

:109  DE:    <LabelList
               content={(props) => <CustomLabel {...(props as { x?: number; y?: number; width?: number; index?: number })} data={data} dataKey={dataKey} />}
             />
      PARA:  <LabelList
               content={isMobile
                 ? () => null
                 : (props) => <CustomLabel {...(props as { x?: number; y?: number; width?: number; index?: number })} data={data} dataKey={dataKey} />}
             />
```

**Por que suprimir e nao alargar.** A alternativa obvia seria `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, dobrando a largura do card para 328px e o plot para 304px, o que daria 50px por barra e resolveria a sobreposicao. Descartei por duas razoes: empilha os 4 mini-graficos em coluna unica, somando cerca de 680px de altura so nesta secao do dashboard, e desmonta a comparacao lado a lado que e o proposito do componente. Densidade de 2 colunas em mobile e o comportamento certo aqui; o que nao cabe e o rotulo.

**Por que o rotulo e o candidato certo a sair.** Ele e informacao secundaria e redundante: a variacao ja e visivel na altura relativa das barras, o valor exato de cada barra continua acessivel pelo `Tooltip` (`:93`), e o `YAxis` permanece. O dado principal nao se perde.

**Por que `() => null` e nao remover o `<LabelList>` condicionalmente.** O Recharts inspeciona os children do `<Bar>` para montar a arvore de renderizacao, e children condicionais nesse ponto sao uma fonte conhecida de comportamento instavel entre versoes. Manter o `<LabelList>` sempre montado e trocar apenas o `content` e a forma de menor risco.

**Limite honesto desta correcao, e o que ela nao resolve.** `useIsMobile` corta em 1023,98px. Em `lg` o grid vira 4 colunas e o card volta a estreitar: em 1024px de viewport, descontada a sidebar de 256px, cada card fica com cerca de 171px e o plot com **139px**, dando 23px por barra com 6 meses. **Ou seja, a sobreposicao tambem ocorre no desktop, na faixa de 1024px a cerca de 1400px.** Isso e um defeito pre-existente de densidade, nao uma regressao de mobile, e o criterio do PRD desta fase e 360px. **Registro na secao 8 como pendencia e nao amplio o escopo aqui.**

### 4.3 `leads-by-source-chart.tsx:26` e `:54` - a rosca esmaga a legenda

```
:26  DE:    <div className="flex items-center gap-6">
     PARA:  <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">

:54  DE:    <div className="space-y-3 flex-1">
     PARA:  <div className="w-full space-y-3 sm:w-auto sm:flex-1">
```

O componente vive em `dashboard.tsx:346`, dentro de `grid grid-cols-1 lg:grid-cols-2`, entao no mobile ocupa a largura toda. Dentro do `glass-card p-5`: **288px**.

A linha `:26` poe lado a lado uma rosca de largura fixa e a lista de origens:

| Item | Classe | Largura |
|---|---|---|
| rosca | `h-[170px] w-[170px] shrink-0` | 170px |
| `gap-6` | | 24px |
| lista | `flex-1` | **sobra: 94px** |

A rosca e `shrink-0`, entao ela nao cede um pixel. Cada linha da lista (`:56`) e um `justify-between` com dois blocos:

| Bloco | Composicao | Largura |
|---|---|---|
| esquerda | dot 12 + `gap-2.5` 10 + nome `text-xs` "Instagram" (9 chars) 56 | 78px |
| direita | contagem "12" 12 + `ml-1` 4 + "(45%)" em `text-[10px]` 26 | 42px |
| **soma** | | **120px** |

**120px contra 94px disponiveis: 28% acima.** Fora da margem de erro. E nenhum dos dois textos tem `truncate`, entao o nome da origem empurra o container em vez de cortar, e o `justify-between` deixa os dois blocos colidirem. Com nomes mais longos que "Instagram" (o produto permite origens customizadas em `lead-sources-manager`), piora linearmente.

Empilhar devolve os **288px inteiros** para a lista, onde 120px cabe com 2,4x de folga.

**Sobre a mudanca em `:54`, que e a unica alteracao estrutural de comportamento desta Spec.** Ela e obrigatoria, nao cosmetica: com o pai em `flex-col` e `items-center`, os filhos passam a ter largura `shrink-to-fit` em vez de esticar, e a lista encolheria para o tamanho do seu conteudo, centralizada, quebrando o alinhamento `justify-between` de cada linha. O `w-full` restaura a largura total. O `sm:w-auto` esta ali para eliminar qualquer ambiguidade entre `width: 100%` e `flex-basis: 0%` quando `sm:flex-1` volta a valer, embora o `flex-basis` ja tivesse precedencia.

Em 640px e acima, `sm:flex-row` + `items-center` (herdado) + `sm:gap-6` + `sm:w-auto sm:flex-1` reproduzem exatamente o layout de hoje.

### 4.4 `DecorativeLine` (`dashboard.tsx:37`) - SEM ACAO

Renderizado 3 vezes, nos KPI cards de Taxa de Conversao, Score Medio IA e Deals Fechados. E um `ComposedChart` de `h-[80px]` **sem `XAxis`, sem `YAxis`, sem `Legend`, sem `Tooltip`**, com `margin` zerada em todos os lados e dados estaticos (`curveData`, `:25`). Nao ha rotulo algum para sobrepor e nao ha largura minima. Escala para qualquer largura. **Sem acao.**

### 4.5 `monthly-comparison-chart.tsx` - SEM ACAO (codigo morto)

Este arquivo tem `XAxis` e `YAxis` com rotulos e uma `Legend`, e a primeira vista seria candidato a medicao. **Ele nao e renderizado em lugar nenhum.** A unica ocorrencia de `MonthlyComparisonChart` em todo o `src/` esta dentro do proprio arquivo (definicao na linha 25 e export na 61). O `dashboard.tsx` importa `MonthlyComparisonGrid` e `MetricsLineChart`, nao este.

**Nao o toco.** Medir e corrigir responsividade de componente que nao chega ao usuario seria fabricar mudanca. Registro na secao 8 como pendencia de limpeza, que nao e desta fase.

---

## 5. Frente 3 - `/tarefas`

### 5.1 `tarefas.tsx:62` - a altura de desktop vaza para o mobile

```
:62  DE:    <div className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-minimal max-h-[calc(100vh-280px)]">
     PARA:  <div className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-minimal lg:max-h-[calc(100vh-280px)]">
```

**Uma unica alteracao: o prefixo `lg:`. Nenhuma mudanca estrutural de JSX.**

**O que os 280px sao.** E a soma do que fica acima da lista **no desktop**: `p-6` do topo (24) + header da pagina (56) + `space-y-6` (24) + tabs (34) + `space-y-6` (24) + linha de filtros (36) + `space-y-6` (24) + cabecalho da coluna (41) da cerca de **263px**, e 280 acrescenta uma folga. A conta e correta e o `max-h` **e desejavel no desktop**: com as 3 colunas lado a lado (`:349`, `lg:grid-cols-3`), ele mantem as tres na mesma altura e faz cada uma rolar internamente, sem a pagina rolar. E o comportamento kanban padrao.

**Por que a mesma conta quebra no mobile.** Tres coisas mudam abaixo de 1024px, e nenhuma esta nos 280px:

1. **O topbar da Fase 1 aparece.** `mobile-topbar.tsx:13` e `h-14`, **56px** que o calculo nao conhece.
2. **O header da pagina empilha.** `:243` e `flex flex-col sm:flex-row`, entao titulo e botao "Nova Tarefa" viram duas linhas, somando cerca de 40px.
3. **Os filtros quebram em varias linhas.** `:281` e `flex-wrap`, e busca (208px) + tipo (144px) + responsavel (160px) nao cabem em 328px, virando 2 linhas.

Somando, o que fica acima da lista no mobile passa de 280px para cerca de **390px**. E `100vh` na direcao oposta e **maior** que a area visivel, porque o navegador mobile resolve `vh` contra a viewport com a barra de URL recolhida.

**Mas o sintoma real nao e corte de conteudo, e vale ser preciso sobre isso.** O `overflow-y-auto` da mesma linha garante que nada fique inalcancavel: o conteudo excedente rola. O defeito e outro, e e de interacao. Com as colunas **empilhadas** no mobile, cada uma vira uma janela de scroll de cerca de 360px **dentro de uma pagina que tambem rola**. Sao **tres areas de scroll aninhado numa tela de 640px**: o dedo do usuario dentro de uma coluna rola a coluna, e para rolar a pagina ele precisa acertar as bordas estreitas entre elas. Em uma tela cujo proposito e ler uma lista de tarefas de cima a baixo, isso e uma armadilha de toque.

**Por que o prefixo `lg:` e a correcao completa.** Abaixo de `lg` o `max-h` deixa de existir; sem altura restrita, o `overflow-y-auto` fica **inerte** (nao ha overflow a capturar) e a coluna cresce com o conteudo. A pagina passa a ter **um unico scroll**, o do `<main>`. O `flex-1` do proprio div e o `min-h-[300px]` do pai (`:52`) continuam valendo e nao dependem do `max-h`.

O breakpoint nao e arbitrario: e **o mesmo `lg` do `:349`**, onde as colunas viram 3 lado a lado. O `max-h` passa a valer exatamente quando a premissa que o justifica (colunas lado a lado) passa a ser verdadeira. Tambem e o mesmo corte do `use-mobile.ts` (1023,98px) e do shell da Fase 1.

**Sobre `dvh`, que o pedido levantou como alternativa.** Nao e necessario e eu nao o recomendo aqui. `dvh` existiria para corrigir o `vh` no mobile, e esta correcao **remove o `vh` do mobile inteiramente**. Em `lg` e acima, `100vh` e estavel e correto. Trocar `vh` por `dvh` acima de 1024px mudaria o desktop sem problema medido para justificar, o que esta fora do que esta fase autoriza.

**Nao regride o desktop:** em `lg` e acima o valor computado e identico ao de hoje, caractere por caractere.

### 5.2 Colunas de status - a decisao ja esta tomada no codigo, e a medida a confirma

O pedido pede que eu escolha entre empilhar e scroll horizontal, e que nao deixe os dois na mesa. **A escolha ja existe e nao e minha:**

```tsx
:349  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
```

`git blame` aponta `5a89ff18`, de **28/04/2026**, junto com a criacao da pagina. **Nao foi a Fase 2, e nao e mudanca recente.** As colunas ja empilham no mobile desde sempre. Nao ha decisao a tomar, ha uma a validar, e a validacao confirma que empilhar e o unico caminho viavel.

**As 3 colunas** (`:29` a `:33`): "A fazer", "Em andamento", "Feito".

**Se ficassem lado a lado em 360px**, com `gap-4`:

```
coluna  = (328 - 32) / 3 = 98,7px
menos p-2 da lista (:62)  = 82,7px
menos p-3 do TaskCard     = 58,7px de conteudo util
```

E o `TaskCard` (`task-card.tsx:90`) tem, so na primeira linha, elementos que nao encolhem:

| Elemento | Classe | Largura |
|---|---|---|
| alca de arraste | `h-4 w-4 shrink-0` | 16px |
| `gap-2` | | 8px |
| icone do tipo | `h-6 w-6 shrink-0` | 24px |
| `gap-2` | | 8px |
| titulo | `flex-1 min-w-0 truncate` | elastico |
| `gap-2` | | 8px |
| menu de acoes | `h-4 w-4` + `p-0.5` `shrink-0` | 20px |
| **soma dos fixos** | | **84px** |

**84px de piso contra 58,7px disponiveis: 43% acima, antes de o titulo da tarefa receber um unico pixel.** O card nao caberia nem vazio. A segunda linha (`:136`, badge do lead + data + avatar) tem o mesmo destino.

**Se fosse scroll horizontal**, cada coluna precisaria de um piso legivel de 84 (fixos) + cerca de 80 (titulo minimo) + 24 (`p-3`) + 16 (`p-2`) = **204px**, dando um track de 3 x 204 + 32 = **644px** rolando lateralmente em 360px.

**Empilhar vence, e por tres razoes alem da aritmetica:**

1. **Modelo mental.** `/tarefas` e uma lista de trabalho consumida em leitura sequencial de cima para baixo. O board do `/pipeline` e uma metafora espacial, onde a posicao horizontal do card **e** a informacao (a etapa do funil). Em `/tarefas` a coluna e so um agrupamento por status, e o `DroppableColumn` ja carrega o status no proprio cabecalho (`:59`, com rotulo e contagem). Empilhar nao perde informacao; esconder 2 de 3 colunas atras de um scroll lateral perde.
2. **Toque.** Scroll horizontal de colunas com `dnd-kit` dentro compete pelo mesmo gesto. E precisamente o risco que o PRD reservou para a Fase 5 tratar no `/pipeline`, e nao ha motivo para importa-lo para ca voluntariamente.
3. **Coerencia com o shell.** `lg` e o mesmo corte da sidebar, do `use-mobile.ts` e do `max-h` da secao 5.1.

**Veredito: SEM ACAO em `:349`.** Registro a medida para que a ausencia de mudanca seja auditavel e nao passe por omissao.

---

## 6. Achado novo: o bloco de botoes de periodo estoura em duas telas

Nao esta no PRD. Apareceu na medicao do `/dashboard` e se repete, identico, no `/deals`. E quebra do **criterio 1** (scroll horizontal no `<body>` em 360px), que e o criterio mais duro do PRD, e ambas as telas estao no escopo declarado desta fase.

**A medida do bloco**, comum as duas telas. Sao 4 `<button>` com `flex items-center gap-2 px-4 py-2 text-sm` mais um icone `h-4 w-4`, num container `flex gap-1.5`:

| Botao | Texto | + icone 16 + `gap-2` 8 + `px-4` 32 | Total |
|---|---|---|---|
| Hoje | 4 chars = 29px | 56 | 85px |
| Semana | 6 = 44px | 56 | 100px |
| Mes | 3 = 22px | 56 | 78px |
| Total | 5 = 37px | 56 | 93px |
| 3 x `gap-1.5` | | | 18px |
| **soma** | | | **374px** |

**374px contra 328px disponiveis: 14% acima.** Fora da margem de erro de 10%, mas registro que e o achado com a menor folga desta Spec. Como os rotulos sao palavras unicas, nao ha quebra de linha possivel dentro dos botoes: **374px e tambem o `min-content` do bloco**, e ele estoura de verdade.

### 6.1 `src/pages/dashboard.tsx:173` e `:180`

Aqui o estouro e muito maior que o do bloco isolado, porque a linha `:173` nao tem `flex-wrap`:

| Item | Largura |
|---|---|
| `<PipelineFilter>` (`pipeline-filter.tsx:24`, `w-[200px]`) | 200px |
| `gap-3` | 12px |
| "Exibir:" em `text-sm` | 51px |
| `gap-3` | 12px |
| bloco dos 4 botoes | 374px |
| **soma** | **649px** |

**649px contra 328px: 98% acima.** O pai (`:157`) e `flex flex-col sm:flex-row`, entao no mobile este bloco ja ganha uma linha inteira so para si, com os 328px, e ainda assim pede o dobro.

```
:173  DE:    <div className="flex items-center gap-3">
      PARA:  <div className="flex flex-wrap items-center gap-3">

:180  DE:    <div className="flex gap-1.5">
      PARA:  <div className="flex flex-wrap gap-1.5">
```

As duas sao necessarias e resolvem coisas diferentes. O `flex-wrap` de `:173` deixa o `PipelineFilter` e o grupo "Exibir: + botoes" caírem em linhas separadas. O de `:180` deixa os 4 botoes se dividirem em duas linhas: "Hoje Semana Mes" soma 85 + 6 + 100 + 6 + 78 = **275px**, que cabe nos 328px, e "Total" desce.

**Ressalva honesta sobre o `PipelineFilter`:** ele retorna `null` quando a empresa tem 1 pipeline ativo ou menos (`pipeline-filter.tsx:17`). Em empresas de pipeline unico a linha soma 437px em vez de 649px. **Continua quebrando** (33% acima), so que menos. A correcao serve aos dois casos.

### 6.2 `src/pages/deals.tsx:192`

```
:192  DE:    <div className="flex gap-1.5">
      PARA:  <div className="flex flex-wrap gap-1.5">
```

O header do `/deals` (`:177`) **ja tem `flex-wrap`**, entao os irmaos (busca `w-56`, `PipelineFilter`, "Importar", "Exportar") ja refluem sozinhos e nao precisam de nada. O que nao reflui e o bloco de `:192`, que e um `flex` sem wrap e portanto um item indivisivel de **374px** dentro de um pai que so consegue oferecer 328px. Uma alteracao resolve.

**As duas correcoes sao inertes no desktop:** `flex-wrap` nao muda nada quando o conteudo cabe, e em `sm` e acima ele cabe.

---

## 7. Arquivos afetados

**7 arquivos de codigo + esta Spec.** Agrupados por arquivo para o diff sair limpo.

| # | Arquivo | Linhas | Item | Tipo |
|---|---|---|---|---|
| 1 | `src/pages/dashboard.tsx` | `:173`, `:180` | 6.1 | classe |
| 2 | `src/pages/deals.tsx` | `:192` | 6.2 | classe |
| 3 | `src/pages/tarefas.tsx` | `:62` | 5.1 | classe |
| 4 | `src/components/dashboard/leads-by-source-chart.tsx` | `:26`, `:54` | 4.3 | classe |
| 5 | `src/components/dashboard/metrics-line-chart.tsx` | `:57` | 4.1 | prop |
| 6 | `src/components/dashboard/monthly-comparison-grid.tsx` | import, `:70`, `:109` | 4.2 | **decisao a aprovar** |
| 7 | `src/components/pipeline/import-steps/result-step.tsx` | `:57` | 3.2 | **opcional, no-op** |
| 8 | `docs/SPEC-responsividade-fase4.md` | novo | esta Spec | doc |

**8 alteracoes de classe, 1 de prop, 1 bloco condicional com import de hook ja existente.** Nenhum arquivo criado alem da Spec. Nenhum token, cor ou CSS var novo. Nenhum `any` introduzido (o `as` de `:109` e o cast que **ja existe** hoje e e transportado sem alteracao).

**Ordem sugerida:** 1, 2, 3 (as classes puras, o grosso do ganho), depois 4 e 5, depois 6 se aprovado, depois 7 se aprovado. Rodar `npm run build` depois do item 4 e ao final.

---

## 8. Fora do escopo desta fase (nao tocar)

Listado explicitamente para nao haver duvida durante a implementacao.

**Fase 5, telas complexas.** Nao tocar em nenhum destes, **mesmo que o defeito seja visivel no caminho**:
- `src/pages/inbox.tsx` e qualquer componente de `src/components/inbox/`
- `src/pages/pipeline.tsx` e `src/components/pipeline/pipeline-board.tsx`
- `contact-panel.tsx`, `edit-lead-modal.tsx`
- `src/stores/inbox.store.ts`
- **O card cortado do `/pipeline` no mobile e Fase 5.** Nao corrigir aqui.

Atencao a uma armadilha de caminho: o item 7 desta Spec (`result-step.tsx`) fica em `src/components/pipeline/import-steps/`. **Esse subdiretorio e do fluxo de importacao de leads, nao do board.** So o arquivo listado na secao 7 pode ser tocado ali.

**Shell da Fase 1, ja entregue:** `main-layout.tsx`, `app-sidebar.tsx`, `mobile-topbar.tsx`, `sheet.tsx`, `use-mobile.ts`. O `use-mobile.ts` e **importado** pelo item 6, nunca modificado.

**Globais da Fase 2, ja entregues:** `dialog.tsx`, o padding `p-4 sm:p-6` das 11 rotas, e os grids ja corrigidos. **Nao refazer grid nenhum.** Se aparecer um `grid-cols-N` sem breakpoint nas tres telas, e regressao: **parar e reportar ao copiloto, nao corrigir por reflexo**. Varri as tres telas e nao ha nenhum.

**Sempre fora:** `src/styles/globals.css`, qualquer arquivo em `supabase/`.

---

## 9. Pendencias registradas, fora do escopo

| # | Pendencia | Onde | Destino |
|---|---|---|---|
| 1 | Rotulo de variacao do `MiniChart` tambem sobrepoe no **desktop** entre 1024px e ~1400px (23px por barra em 1024px), quando o grid vira 4 colunas | `monthly-comparison-grid.tsx:109` | densidade, nao responsividade mobile. Passada futura |
| 2 | `MonthlyComparisonChart` e codigo morto, nao renderizado em lugar nenhum | `monthly-comparison-chart.tsx` | limpeza, nao esta fase |
| 3 | Breakdown dos KPI cards aperta entre 640px e 1024px | `deals.tsx:293`, `:337` | herdada da Spec da Fase 3, continua aberta |
| 4 | `TabsList` de 3 abas estoura cerca de 9px em 390px | `edit-lead-modal.tsx:215` | Fase 5 |
| 5 | Campos Instagram e LinkedIn em 2 colunas no painel de 340px | `contact-panel.tsx:320` | Fase 5 |
| 6 | `inbox.store.ts:32` le `matchMedia` uma unica vez, sem listener | `src/stores/inbox.store.ts` | ciclo do inbox |
| 7 | `alert-dialog.tsx` tem o mesmo problema de `max-h` que o `dialog.tsx` teve | `src/components/ui/alert-dialog.tsx` | avaliar depois |
| 8 | Item 10 da Spec da Fase 3 (medicao de `theme-customizer:284` e `integrations-tab:120` em 360px) nunca foi registrado | `docs/audits/` | **medir junto com a verificacao manual desta fase**, secao 10.2 item 14 |
| 9 | Campo de busca `w-56` desperdica espaco em 360px | `contatos.tsx:80`, `deals.tsx:184`, `tarefas.tsx:288` | estetica, nao quebra |

---

## 10. Verificacao

### 10.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida |
| 2 | `npm run build` | sem erro |
| 3 | `npm run lint` | **medir o baseline no merge-base, nao com `git stash`.** `git merge-base HEAD develop` (deve dar `bacfb4b`), `git checkout --detach` nele, `npm run lint`, anotar, voltar para a branch. Baseline conhecido em 03/08/2026: **81 problemas, 67 erros, 14 warnings**. Reportar "X no baseline, Y na branch, Z novos", nunca "zero erro" |
| 4 | `git status` | nada em `supabase/`, `src/styles/`, `src/stores/`, nos 5 arquivos do shell, em `dialog.tsx`, `inbox.tsx`, `pipeline.tsx`, `pipeline-board.tsx`, `contact-panel.tsx`, `edit-lead-modal.tsx` |
| 5 | `git ls-files docs/SPEC-responsividade-fase4.md` | tem que retornar o caminho. Se voltar vazio, o arquivo esta untracked e **nao vai no commit**, que foi o que aconteceu com os documentos da Fase 1 |
| 6 | `git diff --stat develop` | no maximo 8 arquivos, exatamente os da secao 7 |

### 10.2 Manual, em 360px, 390px e 414px

| # | Verificacao | Criterio do PRD |
|---|---|---|
| 7 | `/dashboard`: o `<body>` nao rola horizontalmente. Os 4 botoes de periodo quebram em 2 linhas, todos clicaveis | 1, 13 |
| 8 | `/dashboard`, empresa com 2+ pipelines ativos: o `PipelineFilter` cai em linha propria e nao espreme os botoes | 1 |
| 9 | `/deals`: o `<body>` nao rola horizontalmente. Botoes de periodo em 2 linhas. A tabela rola lateralmente **dentro** do card, sem arrastar a pagina junto | 1, 12 |
| 10 | `/dashboard` "Leads por Origem": rosca em cima, lista embaixo ocupando a largura toda, nomes de origem e percentuais legiveis e sem colisao | 14 |
| 11 | `/dashboard` "Evolucao das Metricas": trocar o seletor para **12 meses**. Os rotulos do eixo X nao podem se sobrepor; o Recharts deve ocultar intermediarios preservando o primeiro e o ultimo | 14 |
| 12 | `/dashboard` "Comparativo Mensal" (se o item 6 for aprovado): em 6 e em 12 meses, nenhum rotulo de percentual sobre as barras. Barras, eixo Y e tooltip ao toque continuam funcionando | 14 |
| 13 | `/tarefas`: **um unico scroll na tela**. Rolar com o dedo sobre uma coluna deve rolar a pagina inteira, nunca so aquela coluna. As 3 colunas empilhadas, todas as tarefas alcancaveis. Arrastar um card entre colunas ainda funciona | 1, 13, 14 |
| 14 | **Pendencia 8:** `/admin` abas Aparencia e Integracoes. Confirmar se os botoes de `theme-customizer:284` e `integrations-tab:120` **de fato** estouravam antes do `flex-wrap` da Fase 3. Registrar o resultado em `docs/audits/responsividade-fase3-item10-2026-08-03.md`, **mesmo que a resposta seja "cabia"** | Fase 3, 8.2 item 10 |

O item 14 nao e desta fase. Esta aqui porque exige o mesmo dev server e o mesmo viewport, e adiar de novo significa perde-lo.

### 10.3 Nao regressao em desktop (1280px)

| # | Verificacao |
|---|---|
| 15 | `/dashboard` e `/deals`: botoes de periodo em linha unica, na mesma posicao de hoje |
| 16 | `/dashboard` "Leads por Origem": rosca a esquerda, lista a direita, `gap-6`, identico a hoje |
| 17 | `/dashboard` "Evolucao das Metricas" em 12 meses: os 12 rotulos continuam visiveis (cabem com folga de 2,4x, o Recharts nao deve ocultar nenhum) |
| 18 | `/dashboard` "Comparativo Mensal": os rotulos de percentual **continuam aparecendo** acima das barras |
| 19 | `/tarefas`: 3 colunas lado a lado, cada uma com scroll interno proprio, a pagina **nao** rolando. Comportamento identico ao de hoje |
| 20 | `/deals`: tabela e KPI cards inalterados |
| 21 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie. Esta fase nao toca em token nem em CSS var |

O item 19 e o mais importante da nao regressao: e o unico ponto onde uma correcao de mobile poderia ter estragado um comportamento de desktop que funciona bem.
