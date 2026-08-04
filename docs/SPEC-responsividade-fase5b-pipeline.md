# Spec - Responsividade Mobile, Fase 5B (/pipeline)

**Branch:** a definir (ver secao 8.3)
**Base:** `develop`, apos a Fase 5A
**Escopo:** `/pipeline`. O `/inbox` ficou na Fase 5A e **nao entra aqui**, salvo os 4 call sites da secao 4.5.
**PRD de origem:** `docs/PRD-responsividade.md`, secao 4 Fase 5 item 14, secao 2 (linha `/pipeline`) e secao 5 item 16.

---

## 0. Resumo executivo

**Esta fase e diferente das anteriores. O problema nao e de layout, e de conflito de gesto.** O PRD antecipou: "o track ja tem `overflow-x-auto`, entao o foco e o toolbar do board e validar o drag & drop do dnd-kit em touch".

Os dois defeitos foram **observados pela usuaria em aparelho real**, nao deduzidos:

| # | Sintoma relatado | Causa medida |
|---|---|---|
| **D1** | O swipe funciona, mas **o drag entre colunas nao funciona** | `PointerSensor` sem `touch-action`: o navegador reivindica o gesto, dispara `pointercancel`, e o dnd-kit aborta o arraste antes de ele existir |
| **D2** | A tela e **cortada embaixo**, por volta do quarto card, que aparece pela metade | `h-screen` (`100vh`) no `main-layout.tsx:14`. Em mobile, `100vh` e a altura com a barra de endereco **retraida**, entao o rodape do layout fica atras do chrome do navegador |

**Uma correcao previa contra a intuicao e foi descartada:** a leitura inicial supunha que a rolagem estaria quebrada e o arraste funcionando. E o oposto. Isso importa porque muda a solucao: **nao se pode usar `touch-action: none`**, que e a receita padrao para `PointerSensor` em touch, porque ela mataria a rolagem que hoje funciona.

**Total: 8 arquivos, 0 arquivos novos.** Nenhuma alteracao na logica de negocio, em mutation ou em query.

---

## 1. Metodo de medicao

Mesma metodologia das Fases 3, 4 e 5A.

`/pipeline` **nao tem padding de pagina do MainLayout**: `pipeline.tsx` e `flex flex-col h-full overflow-hidden` e o padding e interno ao board (`p-6` no cabecalho, `px-6` no track). Entao a largura util e a largura cheia do `<main>` menos esses 48px.

| Viewport | Sidebar no fluxo | `<main>` | Track util (menos `px-6`) |
|---|---|---|---|
| 360px | nao (drawer) | 360px | **312px** |
| 390px | nao | 390px | 342px |
| 768px | nao | 768px | 720px |
| 1024px (`lg`) | sim, 256px | 768px | 720px |
| 1440px | sim | 1184px | 1136px |

**Altura:** `MainLayout` e `h-screen overflow-hidden`, com `MobileTopbar` de `h-14` (56px) acima do `<main>` abaixo de `lg`. **E exatamente essa cadeia que o D2 quebra**, detalhado em 3.2.

---

## 2. Estado atual medido

### 2.1 O track sobrevive, como o PRD previu

`pipeline-board.tsx:280`:

```
flex-1 flex gap-4 overflow-x-auto overflow-y-hidden px-6 pb-4
```

Colunas em `stage-column.tsx:38` e no bloco "Sem dono" de `:285`: `w-[300px] min-w-[280px] max-w-[320px] flex-shrink-0 flex-col h-full`.

Em 360px o track util e 312px e a coluna e 300px. **Cabe, e nao ha estouro no `<body>`.** Nenhuma coluna precisa mudar de largura nesta fase.

**Mas so cabe UMA coluna.** Com `gap-4` (16px), a segunda comeca em 316px, fora dos 312px visiveis: **nao aparece nem uma faixa dela**. Isso tem duas consequencias, ambas tratadas: nao ha affordance visual de que o board rola (secao 4.4), e arrastar entre colunas depende inteiramente de auto-scroll (secao 8.1).

### 2.2 Como o card se liga ao arraste

`deal-card.tsx:100` a `:105`:

```tsx
ref={setNodeRef}
{...attributes}
{...listeners}
className='kanban-card glass-card rounded-lg p-3 cursor-grab active:cursor-grabbing ...'
```

**Os `listeners` estao no card inteiro, sem alca.** Toda a superficie do card e ativadora de arraste. O `cursor-grab` confirma que a interacao foi desenhada so para mouse: em touch nao existe hover nem affordance.

**Nao ha `touch-action` em lugar nenhum do card.** E o dado central do D1.

---

## 3. Os dois defeitos

### 3.1 D1 - o arraste nunca ativa em touch

`pipeline-board.tsx:83`:

```js
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
)
```

**Um unico sensor.** O `PointerSensor` depende de Pointer Events. Em touch, assim que o navegador decide que o gesto e rolagem, ele dispara `pointercancel` e assume o controle; o dnd-kit escuta `pointercancel` e aborta.

Para o `PointerSensor` funcionar em touch, o elemento arrastavel precisa de `touch-action: none`, para o navegador nunca reivindicar o gesto. **O card nao tem.** Resultado: o navegador ganha sempre, a rolagem funciona e o arraste nunca chega a ativar. Bate exatamente com o relato.

**Por que `touch-action: none` esta DESCARTADO.** E a receita padrao para `PointerSensor`, e aqui ela e a solucao errada: ligaria o arraste e **mataria a rolagem que hoje funciona**, tanto a horizontal do track quanto a vertical de dentro da coluna (`stage-column`, `overflow-y-auto`). Como os cards ocupam quase toda a area util, o usuario perderia os dois scrolls. Trocaria um defeito por dois piores.

**Decisao 1 da usuaria, em 2026-08-04: segurar para arrastar.** Sensores separados por tipo de entrada, cada um com a restricao que faz sentido:

```js
useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
```

O `delay` resolve o conflito sem CSS: durante os 250ms o dnd-kit **nao** chama `preventDefault`, entao o navegador rola normalmente se o dedo se mover mais que `tolerance`; se o dedo ficar parado ate o fim do delay, o arraste ativa e passa a bloquear a rolagem. **Swipe rola, segurar arrasta.**

Alternativas descartadas: **alca de arraste no card** (descobrivel, mas ocupa espaco num card ja denso e mudaria o desktop) e **as duas juntas** (mais superficie para testar sem ganho claro).

**Custo aceito:** `MouseSensor` + `TouchSensor` nao cobrem caneta/stylus, que o `PointerSensor` cobria. Nao ha alvo de stylus neste produto. Registrado como pendencia 3.

**Custo aceito 2:** long-press e um gesto invisivel. Quem nao o conhece pode concluir que arrastar nao funciona. Nao ha affordance no card, e criar uma era a alternativa da alca, descartada. Registrado como pendencia 4.

### 3.2 D2 - a tela cortada embaixo

`main-layout.tsx:14`:

```tsx
<div className="flex h-screen overflow-hidden">
```

`h-screen` e `100vh`. **Em navegador mobile, `100vh` e a altura da viewport com a barra de endereco RETRAIDA**, ou seja, a maior possivel. Com a barra visivel, que e o estado normal ao abrir a pagina, o layout fica mais alto que a area visivel e os ultimos 56 a 120px, conforme o navegador, caem atras do chrome.

**Por que so o `/pipeline` manifesta.** Nas demais telas o `<main>` e `overflow-y-auto` e o trecho escondido e alcancavel rolando a pagina. O `/pipeline` e a **unica tela de altura fixa** do produto: `pipeline.tsx` e `h-full overflow-hidden` e o board e `h-full`. Nada rola no nivel da pagina. O unico scroller vertical e o de dentro da coluna, e o fundo dele esta fora da tela, entao o ultimo card aparece cortado e **nao ha como alcanca-lo**.

**Correcao: `h-dvh`.** A unidade `dvh` acompanha o chrome do navegador dinamicamente. O projeto esta no Tailwind **3.4.19**, e `h-dvh` existe desde a 3.4: e uma palavra trocada, sem plugin nem config.

Descartado `h-svh`, que e estavel mas deixa uma faixa vazia quando o chrome retrai. Para um shell de aplicacao, `dvh` e o comportamento correto.

**Esta e uma excecao deliberada a regra de nao tocar no shell da Fase 1**, e precisa de ciencia explicita da usuaria (secao 8.2). O defeito esta la, e a correcao beneficia todas as telas, nao so esta.

---

## 4. Mudancas por arquivo

### 4.1 `src/components/pipeline/pipeline-board.tsx` - os sensores

```
:6   DE:    PointerSensor,
     PARA:  MouseSensor,
            TouchSensor,

:83  DE:    const sensors = useSensors(
              useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
            )

     PARA:  const sensors = useSensors(
              // Sensores separados por tipo de entrada. O PointerSensor unico nao
              // funcionava em touch: sem `touch-action: none` o navegador reivindica
              // o gesto e dispara pointercancel, abortando o arraste. E `touch-action:
              // none` esta fora de questao porque mataria a rolagem do track e das
              // colunas. O `delay` resolve sem CSS: mover o dedo rola, segurar arrasta.
              useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
              useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
            )
```

**O `distance: 5` do mouse e preservado**, entao o desktop fica identico ao de hoje.

**Nenhuma outra linha deste arquivo muda por causa dos sensores.** O `DndContext` de `:273`, o `closestCorners`, o `handleDragStart` e o `handleDragEnd` ficam como estao.

### 4.2 `src/components/layout/main-layout.tsx` - o `h-dvh`

```
:14  DE:    <div className="flex h-screen overflow-hidden">
     PARA:  <div className="flex h-dvh overflow-hidden">
```

**Uma palavra. Nada mais neste arquivo.** Nao mexer no `min-w-0`, no `<main>`, no `MobileTopbar` nem no `ErrorReportButton`.

O `h-screen` de `app-sidebar.tsx:254` **nao muda**: ele esta atras de `hidden lg:flex`, ou seja, so existe em desktop, onde `100vh` e correto e estavel.

### 4.3 `src/components/pipeline/pipeline-board.tsx` - o padding

A Fase 2 estabeleceu `p-4 sm:p-6` como padding de pagina. O board usa `p-6`/`px-6` fixo em tres pontos, o que gasta 48px de largura em 360px:

```
:248  DE:    <div className="shrink-0 p-6 pb-4 space-y-3">
      PARA:  <div className="shrink-0 p-4 pb-3 sm:p-6 sm:pb-4 space-y-3">

:268  DE:    <div className="mx-6 mb-2 flex items-center gap-2 ...">
      PARA:  <div className="mx-4 sm:mx-6 mb-2 flex items-center gap-2 ...">

:280  DE:    'flex-1 flex gap-4 overflow-x-auto overflow-y-hidden px-6 pb-4 ...'
      PARA:  'flex-1 flex gap-4 overflow-x-auto overflow-y-hidden px-4 sm:px-6 pb-4 ...'
```

Em 360px isso devolve 16px ao track (312 para 328). **Nao e so consistencia:** com 328px e `gap-4`, a segunda coluna passa a comecar em 316px e **12px dela ficam visiveis**, que e a affordance de que o board rola. Hoje nao aparece nada.

### 4.4 `src/components/pipeline/pipeline-header.tsx` - o toolbar

O toolbar (`:85`) e `flex flex-wrap items-center gap-2` com larguras fixas: busca `w-48` (192px), selects `w-36` (144px) e `w-44` (176px), tres botoes de icone `h-9 w-9` e o botao "Novo". Somados com os `gap-2`, sao cerca de **806px de conteudo fixo** contra os 328px uteis de 360px: o `flex-wrap` salva do estouro, mas quebra em cerca de **4 linhas**, custando ~176px de altura numa tela onde o board ja disputa altura com o D2.

```
:107  busca      DE: 'h-9 w-48 pl-8'        PARA: 'h-9 w-full pl-8 sm:w-48'
:115  select 1   DE: 'h-9 w-36'             PARA: 'h-9 flex-1 sm:flex-none sm:w-36'
:130  select 2   DE: 'h-9 w-44'             PARA: 'h-9 flex-1 sm:flex-none sm:w-44'
```

Abaixo de `sm`: linha 1 a busca inteira, linha 2 os dois selects dividindo a largura, linha 3 os botoes. **Tres linhas em vez de quatro**, sem largura fixa apertando. De `sm` para cima tudo volta ao de hoje.

**Alvo de toque dos botoes de icone.** `h-9 w-9` e 36px e viola o criterio 13 do PRD (44x44 minimo no mobile). Mesmo padrao que a Fase 5A aplicou no `chat-header`:

```
:147, :153, :161  DE: 'h-9 w-9'   PARA: 'h-11 w-11 sm:h-9 sm:w-9'
```

Desktop identico, mobile em conformidade.

### 4.5 Os 4 call sites de `/inbox?lead=` - pendencia 1 da Fase 5

A Spec da Fase 5A registrou na secao 9: "os 4 call sites continuam na forma antiga, servidos por redirect. Destino: branch do `/pipeline`, que pode migrar os quatro de uma vez". **O `deal-card.tsx` so entra em escopo agora, entao este e o momento.**

```
src/components/pipeline/deal-card.tsx:241      navigate(`/inbox?lead=${deal.lead_id}`)
src/components/shared/notification-center.tsx:80   navigate(`/inbox?lead=${notification.action_data.leadId}`)
src/pages/deals.tsx:461                        navigate(`/inbox?lead=${deal.lead_id}`)
src/pages/contatos.tsx:233                     navigate(`/inbox?lead=${c.id}`)
```

Em todos, trocar `` `/inbox?lead=${X}` `` por `` `/inbox/${X}` ``.

**O redirect de compatibilidade em `inbox.tsx:28` a `:33` PERMANECE.** Ele serve qualquer URL antiga ja compartilhada ou salva por um usuario, que os call sites nao alcancam. Migrar os call sites nao o torna obsoleto.

### 4.6 `src/components/pipeline/edit-lead-modal.tsx` - pendencia 3 da Fase 5

```
:215  DE:    <TabsList className="grid w-full grid-cols-3">
      PARA:  <TabsList className="grid w-full grid-cols-3 h-auto">
```

Com `h-auto` os rotulos podem ocupar duas linhas em vez de estourar cerca de 9px em 390px. **Confirmar na verificacao manual** (item 16): se o estouro nao se reproduzir, reverter e fechar a pendencia como inerte, do mesmo jeito que a Fase 3 tratou o item 10.

---

## 5. Verificacao do layout final, por viewport

| Viewport | Colunas visiveis | Toolbar | Altura util |
|---|---|---|---|
| 360px | 1 completa + 12px da seguinte | 3 linhas | corrigida pelo `h-dvh` |
| 390px | 1 completa + 42px da seguinte | 3 linhas | idem |
| 768px | 2 completas | 1 linha | idem |
| 1024px | 2 completas | 1 linha | inalterada |
| 1440px | 3 completas + faixa | 1 linha | inalterada |

---

## 6. Arquivos afetados

**8 arquivos, nenhum novo.** Quatro deles sao de uma linha so (os call sites de 4.5) e um e de uma palavra (o `h-dvh` de 4.2).

| # | Arquivo | Item | Tipo |
|---|---|---|---|
| 1 | `src/components/pipeline/pipeline-board.tsx` | 4.1, 4.3 | sensores e padding |
| 2 | `src/components/layout/main-layout.tsx` | 4.2 | **1 palavra, excecao ao shell** |
| 3 | `src/components/pipeline/pipeline-header.tsx` | 4.4 | toolbar |
| 4 | `src/components/pipeline/deal-card.tsx` | 4.5 | 1 linha |
| 5 | `src/components/shared/notification-center.tsx` | 4.5 | 1 linha |
| 6 | `src/pages/contatos.tsx` | 4.5 | 1 linha |
| 7 | `src/pages/deals.tsx` | 4.5 | 1 linha |
| 8 | `src/components/pipeline/edit-lead-modal.tsx` | 4.6 | 1 linha |

**Ordem sugerida:** 2 (o `h-dvh`, que destrava a altura para testar o resto), 1 (sensores e padding), 3, depois os de 1 linha.

**Nenhuma linha de logica de negocio, mutation ou query e tocada.** `use-pipeline-*`, `use-deals`, os services e as Edge Functions **nao aparecem nesta lista e nao devem ser abertos para edicao**.

---

## 7. O risco residual, e ele e o principal desta fase

### 7.1 Ativar o gesto e condicao necessaria, nao suficiente

**Em 360px so UMA coluna cabe na tela** (secao 2.1). Entao "arrastar entre colunas", que e a queixa literal da usuaria, exige que o **auto-scroll do dnd-kit** role o track enquanto o card esta sendo arrastado: o usuario segura o card, leva ao limite da tela, e o board precisa deslizar sozinho ate a coluna de destino aparecer.

O `DndContext` de `:273` **nao configura `autoScroll`**, entao vale o padrao do dnd-kit, que e auto-scroll habilitado no ancestral rolavel mais proximo. O track e `overflow-x-auto`, entao em tese ele qualifica.

**Nao consigo afirmar por medicao estatica que isso funciona em touch.** O auto-scroll do dnd-kit foi desenhado com mouse em mente e depende de o ponteiro chegar perto da borda do container. Com o dedo cobrindo parte da tela e uma unica coluna visivel, a margem de acionamento e estreita.

**Consequencia pratica:** se o auto-scroll nao acionar, os sensores estarao corretos e o defeito relatado continuara de pe, so que por outro motivo. **Este e o item 12 da verificacao manual e o unico que pode reprovar a fase inteira.**

Se reprovar, as saidas conhecidas, em ordem de custo, sao: configurar `autoScroll` com `threshold` mais generoso; ou oferecer mover o card por menu em vez de arraste no mobile, que e mudanca de UX e exigiria nova decisao.

### 7.2 O long-press nao tem affordance

Registrado em 3.1 como custo aceito da Decisao 1. Vale observar na verificacao manual (item 13) se o gesto e descoberto sem instrucao, porque isso alimenta a decisao futura sobre a alca.

---

## 8. Pontos que precisam de ciencia antes da implementacao

### 8.1 O auto-scroll

Ver 7.1. **Nao e risco de desenho, e risco de plataforma**, e so aparelho real resolve.

### 8.2 EXCECAO: esta fase toca o shell da Fase 1

`main-layout.tsx` esta na lista de nao-tocar de todas as Specs desde a Fase 1. **Esta Spec propoe abrir excecao para uma palavra** (`h-screen` para `h-dvh`, item 4.2).

Justificativa: o defeito D2 esta nesse arquivo e nao ha como corrigi-lo de fora. Contorna-lo no `/pipeline` (por exemplo com `h-[calc(100dvh-56px)]` no `pipeline.tsx`) duplicaria a aritmetica do shell numa tela so, deixaria as demais com o bug latente e criaria dois lugares para manter a mesma altura.

**A excecao e limitada a linha `:14`.** Nenhuma outra linha do shell entra.

### 8.3 A branch, e a dependencia da Fase 5A

A Fase 5A esta commitada mas **nao passou pela verificacao manual nem virou PR**. A 5B pode sair da branch atual, herdando a 5A e a dependencia dela, ou de `develop` depois que a 5A for aprovada.

**Decisao adiada de proposito:** esta Spec e trabalho de leitura e nao precisa de branch. A escolha cabe a usuaria no momento de implementar, quando o resultado da verificacao da 5A for conhecido.

---

## 9. Fora do escopo

**Toda a logica de negocio do pipeline:** `use-pipeline-stages`, `use-deals`, `use-pipeline-access`, os services, as mutations de mover card, o realtime. **Se algum deles parecer exigir mudanca, PARAR e reportar.**

**Os modais, exceto a linha 4.6:** `stage-manager-modal`, `import-leads-modal` e seus `import-steps`, `move-pipeline-modal`, `transfer-lead-modal`, `deal-value-dialog`, `new-deal-modal`. O `edit-lead-modal` entra **so** pelo `TabsList`.

**O resto do shell da Fase 1:** `app-sidebar.tsx` (inclusive o `h-screen` de `:254`, que e desktop e esta correto), `mobile-topbar.tsx`, `sheet.tsx`, `use-mobile.ts`.

**O `/inbox`,** salvo os call sites de 4.5. O `use-panel-inline.ts` e o `inbox.store.ts` nao sao tocados.

**Sempre fora:** `src/styles/globals.css`, `supabase/`.

### Pendencias registradas

| # | Pendencia | Onde | Destino |
|---|---|---|---|
| 1 | `cursor-grab` no card e affordance so de mouse; em touch nao ha equivalente | `deal-card.tsx:105` | junto da decisao da alca |
| 2 | Nao ha `KeyboardSensor`: o board nao e operavel por teclado | `pipeline-board.tsx:83` | passada de acessibilidade |
| 3 | `MouseSensor` + `TouchSensor` nao cobrem caneta/stylus, que o `PointerSensor` cobria | `pipeline-board.tsx:83` | so se surgir alvo de stylus |
| 4 | Long-press e gesto invisivel, sem affordance | `deal-card.tsx` | depende do item 13 da verificacao |
| 5 | Botoes `h-9` do toolbar que **nao** sao de icone seguem abaixo de 44px | `pipeline-header.tsx:176` | avaliar junto do item 15 |
| 6 | Rotulo de variacao do `MiniChart` sobrepoe entre 1024 e ~1400px | `monthly-comparison-grid.tsx:109` | herdada da Fase 4 |
| 7 | `MonthlyComparisonChart` e codigo morto | `monthly-comparison-chart.tsx` | limpeza |
| 8 | `alert-dialog.tsx` tem o mesmo problema de `max-h` que o `dialog.tsx` teve | `src/components/ui/alert-dialog.tsx` | avaliar |
| 9 | Cores de status hardcoded nas chamadas do `Breakdown` | `dashboard.tsx`, `deals.tsx` | herdada do fix de `/deals` |

---

## 10. Verificacao

### 10.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida. **Sensivel nesta fase:** trocar `PointerSensor` por dois sensores faz o TypeScript apontar import esquecido |
| 2 | `npm run build` | sem erro |
| 3 | `npm run lint` | baseline no **merge-base**, nunca com `git stash`. Reportar "X no baseline, Y na branch, Z novos", e **tambem quais arquivos tocados aparecem na saida e com quais achados**, nao so o total |
| 4 | `git status` | nada em `supabase/`, `src/styles/`, nos hooks e services do pipeline, nem nos modais fora de 4.6. **`main-layout.tsx` deve aparecer, e e a unica excecao** |
| 5 | `git ls-files docs/SPEC-responsividade-fase5b-pipeline.md` | tem que retornar o caminho |
| 6 | `git diff --stat develop` | no maximo 9 arquivos, exatamente os da secao 6 mais esta Spec |

### 10.2 Manual, em aparelho real - **e a parte que decide a fase**

| # | Verificacao | Origem |
|---|---|---|
| 7 | **A tela nao e mais cortada embaixo.** O ultimo card da coluna e alcancavel rolando, e nenhum card fica pela metade atras do chrome do navegador | D2 |
| 8 | Rolar a pagina para o chrome retrair e voltar: o layout se ajusta e **nada fica inacessivel** em nenhum dos dois estados | D2, `dvh` |
| 9 | **O swipe continua rolando**, tanto o horizontal do board quanto o vertical dentro da coluna. **Nao pode ter regredido** | D1 |
| 10 | **Segurar o card ~250ms inicia o arraste**, com o card seguindo o dedo | Decisao 1 |
| 11 | Mover o dedo antes dos 250ms **rola** e nao arrasta | Decisao 1 |
| 12 | **ARRASTAR ENTRE COLUNAS.** Segurar um card, levar ao limite da tela, e o board tem que rolar sozinho ate a coluna de destino. **E a queixa original e o unico item que pode reprovar a fase inteira** | 7.1 |
| 13 | Alguem que nao conhece o gesto descobre que da para arrastar? Observar sem instruir | 7.2 |
| 14 | O toolbar ocupa 3 linhas e nao 4, sem largura apertada | 4.4 |
| 15 | Os botoes de icone do toolbar tem area de toque confortavel | criterio 13 |
| 16 | O `TabsList` do `edit-lead-modal` nao estoura. **Se nunca estourava, reverter 4.6 e fechar a pendencia como inerte** | 4.6 |
| 17 | Os 4 links migrados caem direto em `/inbox/<id>`, **sem passar pelo redirect** (a URL nao pisca) | 4.5 |
| 18 | Uma URL antiga `/inbox?lead=<id>` digitada na barra **continua funcionando** | 4.5 |

### 10.3 Nao regressao em desktop

| # | Verificacao | Viewport |
|---|---|---|
| 19 | **Arrastar com mouse funciona identico ao de hoje**, sem delay perceptivel. E o `distance: 5` do `MouseSensor` | 1440px |
| 20 | O toolbar volta ao layout de uma linha, com as larguras fixas de hoje | 1440px |
| 21 | Tres colunas visiveis, larguras inalteradas | 1440px |
| 22 | **O `h-dvh` nao mudou nada no desktop**, onde a altura da viewport e estavel. Conferir tambem `/dashboard`, `/deals` e `/inbox`, que compartilham o shell | 1440px |
| 23 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie | 1440px |

O item 22 e o que protege a excecao da secao 8.2: se o `h-dvh` alterar qualquer tela no desktop, a excecao ao shell nao se justifica.
