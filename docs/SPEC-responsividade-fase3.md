# Spec - Responsividade Mobile, Fase 3 (telas simples)

**Branch:** `feature/responsividade-mobile-telas-simples`
**Base:** `develop` (Fases 1 e 2 ja mergeadas, em `b785721` e `862e6f1`)
**Escopo:** frontend puro. Sem migration, sem schema, sem Edge Function.
**PRD de origem:** `docs/PRD-responsividade.md`, secao 4, Fase 3 (itens 9 e 10), e a tabela de telas da secao 2, linhas de complexidade "Baixa".

Telas em escopo: `/minha-conta`, `/contatos`, `/super-admin`, `/sdr-ia`, `/gestao`, `/admin`.

---

## 0. O que as Fases 1 e 2 ja resolveram

O PRD listou a Fase 3 antes das duas primeiras existirem. Boa parte do que ele previu **ja esta feito** e nao aparece nesta Spec:

| Ja resolvido | Onde | Fase |
|---|---|---|
| Sidebar vira drawer abaixo de 1024px | shell | 1 |
| Padding `p-4 sm:p-6` nas 6 telas simples | raiz de cada pagina | 2 |
| `/sdr-ia` com `px-4 py-4 sm:px-8 sm:py-6` | `sdr-ia.tsx:47` | 2 |
| Modais com `max-h-[90dvh]` e scroll interno | `dialog.tsx` | 2 |
| Modal de metas com teto de largura em mobile | `goals-manager.tsx:296` | 2 |
| Grids Mes/Ano e Inicio/Fim empilhados | `goals-manager.tsx:327` e `:363` | 2 |
| Tabela de `/contatos` em `overflow-x-auto` | `contatos.tsx:140` | ja existia |
| Tabelas de `sellers-tab` e `companies-dashboard` em `overflow-x-auto` | `:81` e `:36` | ja existia |
| `EmpresaTab` com `sm:grid-cols-2` | `admin.tsx:22` | ja existia |
| `TabsList` com `flex-wrap h-auto gap-1` em `/gestao` e `/admin` | `gestao.tsx:19`, `admin.tsx:49` | ja existia |

Todos os numeros de linha desta Spec foram medidos contra a `develop` de hoje, pos merge das duas fases.

---

## 1. Metodo de medicao

Toda largura abaixo e calculada assim, e o metodo importa porque define o que e afirmacao e o que e suspeita.

**Larguras disponiveis, em viewport de 360px (o pior dos tres alvos):**

| Nivel | Conta | Disponivel |
|---|---|---|
| Viewport | | 360px |
| Raiz da pagina (`p-4`, Fase 2) | 360 - 32 | **328px** |
| Dentro de um `Card` (`CardContent` e `p-6`, `card.tsx:38`) | 328 - 48 | **280px** |
| Dentro de um `Dialog` em 390px (`p-6`, base pos Fase 2) | 358 - 48 | **310px** |

**Largura de texto:** contagem de caracteres vezes a media do glifo. `text-sm` (14px) = 7,3px por caractere; `text-xs` (12px) = 6,2px; `text-[10px]` = 5,2px. Somo padding, icone e gap declarados na classe.

**Margem de erro: cerca de 10%.** Por isso separo os achados em dois grupos: os que estouram por mais de 20% da largura disponivel, que afirmo como quebra; e os que estouram por menos de 10%, que trato como risco marginal a confirmar no browser, com correcao defensiva de custo zero. Nao inflo nenhum caso marginal para virar quebra.

Elementos que nao encolhem: `Button` tem `whitespace-nowrap` (`button.tsx:7`) e `TabsTrigger` tambem (`tabs.tsx:29`). Numa linha `flex` sem `flex-wrap`, o `min-content` deles e a largura cheia, entao a linha estoura de verdade. Ja `SelectTrigger` tem `[&>span]:line-clamp-1` (`select.tsx:17`) e encolhe: nao gera scroll, mas degrada.

---

## 2. Resultado da reverificacao, por tela

| Tela | Veredito | Itens |
|---|---|---|
| `/minha-conta` | **1 quebra** | `TabsList` sem `flex-wrap` |
| `/sdr-ia` | **1 quebra** | linha do seletor de pipeline |
| `/gestao` | **1 quebra** + 1 marginal | linha de metrica do `goals-manager`, botoes do `reports-tab` |
| `/admin` | **2 marginais** | botoes do `theme-customizer` e do `integrations-tab` |
| `/contatos` | **sem acao** | |
| `/super-admin` | **sem acao** | |

**4 quebras confirmadas, 3 correcoes defensivas, 7 arquivos.** Detalhe e justificativa de cada "sem acao" na secao 5.

---

## 3. Quebras confirmadas

### 3.1 `src/pages/minha-conta.tsx:17` - `TabsList` sem quebra de linha

```
DE:    <TabsList>
PARA:  <TabsList className="flex-wrap h-auto gap-1">
```

Quatro abas, e `TabsList` e `inline-flex ... p-1` sem `flex-wrap` (`tabs.tsx:14`). Os `TabsTrigger` sao `whitespace-nowrap px-3` (`tabs.tsx:29`), entao nao ha para onde encolher:

| Aba | Texto | + `px-3` | Total |
|---|---|---|---|
| Perfil | 44px | 24 | 68px |
| Scripts | 51px | 24 | 75px |
| Notificacoes | 88px | 24 | 112px |
| Meus Relatorios | 110px | 24 | 134px |
| | | `p-1` do TabsList | 8px |
| | | **soma** | **397px** |

**397px contra 328px disponiveis: estoura 69px, 21% acima.** Fora da margem de erro. Isso rola o `<body>` horizontalmente e viola o criterio 1 do PRD.

A correcao **nao inventa padrao**: e exatamente a classe que `gestao.tsx:19` e `admin.tsx:49` ja usam. `h-auto` e necessario junto do `flex-wrap`, senao a segunda linha vaza dos `h-10` fixos da base.

### 3.2 `src/pages/sdr-ia.tsx:64` e `:66` - linha do seletor de pipeline

```
:64  DE:    <div className="flex items-center gap-3">
     PARA:  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

:66  DE:    <SelectTrigger className="w-64">
     PARA:  <SelectTrigger className="w-full sm:w-64">
```

Este e o item que o PRD apontou. A linha atual pede:

| Item | Largura |
|---|---|
| `SelectTrigger className="w-64"` | 256px |
| `gap-3` | 12px |
| Botao "Desativar" (icone 14 + `gap-1` 4 + texto 66 + `px-3` 24) | 108px |
| `gap-2` | 8px |
| Botao "Editar" (icone 14 + 4 + texto 44 + 24) | 86px |
| **soma** | **470px** |

**470px contra 328px: 43% acima.**

Vale ser preciso sobre o sintoma, porque ele nao e scroll horizontal. Os dois botoes tem `whitespace-nowrap` e nao encolhem (194px de piso), mas o `SelectTrigger` encolhe. Na pratica o select e espremido para cerca de 120px em vez dos 256px pedidos, e o nome do pipeline fica ilegivel sob o `line-clamp-1`. Ou seja: **o `w-64` da linha 66 simplesmente nao vale no mobile hoje, e a intencao do layout se perde.** Empilhar devolve os 328px inteiros ao select e poe os botoes numa linha propria.

Em 640px e acima nada muda: `sm:flex-row sm:items-center` e `sm:w-64` reproduzem o comportamento atual.

**Confirmacao pedida sobre a grade desta tela:** `sdr-ia.tsx:113` e `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`. **Ja e responsiva**, o PRD estava certo. Sem acao.

**Confirmacao sobre o `TabsList` desta tela** (`:49`, sem `flex-wrap`, ao contrario do `/minha-conta`): "Dashboard" 90px + "Configuracao" 112px + "Sandbox" 75px + `p-1` 8px = **285px contra 328px**. Cabe, com 43px de folga. **Sem acao**, e a diferenca em relacao ao `/minha-conta` e so que la sao quatro abas com rotulos mais longos.

### 3.3 `src/components/gestao/goals-manager.tsx:414` - linha de metrica

Aba **Metas** do `/gestao`, dentro do modal de meta (`sm:max-w-xl`, portanto 310px uteis em 390px, menos o `p-3` da propria linha = **286px**).

A linha empilha larguras fixas que somam muito mais que isso:

| Campo | Classe | Largura |
|---|---|---|
| Tipo | `flex-1` | elastico |
| Alvo | `w-24` | 96px |
| Escopo | `w-32` | 128px |
| Vendedor (so quando escopo = individual) | `w-40` | 160px |
| Remover | `h-9 px-2` | 40px |
| 4 x `gap-2` | | 32px |
| **soma dos fixos** | | **456px** |

**456px contra 286px: 59% acima**, e isso antes de o campo "Tipo" (`flex-1`) receber um unico pixel. Mesmo no caso sem "Vendedor", os fixos ja somam 296px e o "Tipo" fica com largura zero. Todos os `SelectTrigger` encolhem para cerca de 55px, onde "Equipe toda" nao e legivel. **A linha e inutilizavel no mobile.**

Cinco alteracoes, todas no mesmo bloco:

```
:414  DE:    <div key={i} className="flex items-end gap-2 rounded-md border border-border p-3">
      PARA:  <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end">

:434  DE:    <div className="w-24 space-y-1">
      PARA:  <div className="w-full space-y-1 sm:w-24">

:445  DE:    <div className="w-32 space-y-1">
      PARA:  <div className="w-full space-y-1 sm:w-32">

:462  DE:    <div className="w-40 space-y-1">
      PARA:  <div className="w-full space-y-1 sm:w-40">

:486  DE:    className="h-9 px-2"
      PARA:  className="h-9 px-2 self-end sm:self-auto"
```

Duas observacoes sobre esse conjunto:

- **`:415` (`flex-1` do campo Tipo) nao muda.** Em `flex-col` o `flex-1` age no eixo vertical e nao causa efeito visivel, e em `sm:flex-row` volta a ser exatamente o comportamento de hoje. Mexer seria risco sem ganho.
- **`:486` precisa do `self-end`.** Em `flex-col` o padrao e `align-items: stretch`, entao o botao de lixeira viraria uma barra de largura total. `self-end` mantem ele compacto e alinhado a direita; `sm:self-auto` devolve o comportamento atual no desktop.

Em 640px e acima o resultado e identico ao de hoje, campo por campo.

### 3.4 `src/components/admin/reports-tab.tsx:16` - tres botoes de exportacao

```
DE:    <div className="flex gap-3">
PARA:  <div className="flex flex-wrap gap-3">
```

Aba **Relatorios** do `/gestao`. Dentro de `CardContent`, portanto **280px**.

| Botao | Icone + `mr-2` | Texto | `px-4` | Total |
|---|---|---|---|---|
| Exportar CSV | 24 | 88 | 32 | 144px |
| Exportar Excel | 24 | 102 | 32 | 158px |
| Exportar PDF | 24 | 88 | 32 | 144px |
| 2 x `gap-3` | | | | 24px |
| **soma** | | | | **470px** |

**470px contra 280px: 68% acima.** Como `Button` e `whitespace-nowrap`, esse 470px e tambem o `min-content` da linha: nao ha encolhimento possivel e o container estoura de verdade, gerando scroll horizontal.

`flex-wrap` e a correcao de menor risco: em 280px cada botao cai numa linha (144 + 12 + 158 = 314 > 280, entao nem dois cabem juntos), e em `sm` e acima a linha unica de hoje volta sozinha, sem precisar de prefixo de breakpoint.

---

## 4. Correcoes defensivas (risco marginal)

Os dois casos abaixo estouram por **menos de 10%**, ou seja, dentro da minha margem de erro. Nao afirmo que quebram. Trato como risco a confirmar no browser, e proponho `flex-wrap`, que **e inerte quando o conteudo cabe**: nao muda nada no desktop nem no mobile se a medicao estiver superestimada, e conserta se estiver certa. Custo zero, por isso valem a pena mesmo sem certeza.

### 4.1 `src/components/company/theme-customizer.tsx:284`

```
DE:    <div className="flex gap-3 pt-2">
PARA:  <div className="flex flex-wrap gap-3 pt-2">
```

Aba **Aparencia** do `/admin`, dentro de `CardContent` (280px). "Restaurar Padrao" (icone 24 + texto 117 + `px-4` 32 = 173px) + `gap-3` 12 + "Salvar Tema" (texto 80 + 32 = 112px) = **297px contra 280px**, ou seja 6% acima. Ambos os botoes sao `whitespace-nowrap`.

Registro que as outras duas linhas de botoes desse mesmo arquivo **foram medidas e cabem**, entao nao sao tocadas: `:250` (Plano, Elevado, Glass) soma 237px e `:268` (Solido, Glass) soma 146px, contra os mesmos 280px.

### 4.2 `src/components/admin/integrations-tab.tsx:120`

```
DE:    <div className="flex gap-2">
PARA:  <div className="flex flex-wrap gap-2">
```

Aba **Integracoes** do `/admin`. Tres botoes `size="sm"` (`px-3`) em `text-xs`: "Copiar curl" 108px + "Regenerar token" 133px + botao so de icone 36px + 2 x `gap-2` 16px = **293px contra 280px**, 5% acima.

A linha `:234` do mesmo arquivo ("Cancelar" e "Criar webhook", `h-7 text-xs`) soma cerca de 170px e **cabe com folga**. Nao e tocada.

---

## 5. Telas e componentes sem acao

O PRD previa trabalho nestas telas. Depois das Fases 1 e 2, a reverificacao nao encontrou nada que quebre. Registro com a medida para que a ausencia de mudanca seja auditavel, e nao uma omissao.

### 5.1 `/contatos` - sem acao

- **Padding:** ja e `p-4 sm:p-6` (`:63`, Fase 2).
- **Cabecalho:** `contatos.tsx:67` e `:73` **ja tem `flex-wrap`**. O item mais largo da barra de filtros e o campo de busca, `w-56` (224px), abaixo dos 328px disponiveis. Os demais (`w-36` = 144px, `w-40` = 160px, botoes `size="sm"`) sao menores. Com `flex-wrap`, tudo reflui em varias linhas e **nada estoura**.
- **Tabela:** ja esta em `overflow-x-auto` (`:140`), dentro de um `glass-card p-5`.

O campo de busca ocupar 224px de 328px e desperdicio de espaco, e `w-full sm:w-56` aproveitaria melhor. **Nao especifico essa mudanca**: e preferencia estetica, nao correcao de quebra, e o pedido foi explicito em nao fabricar mudanca.

### 5.2 `/super-admin` - sem acao

Os 37 linhas da pagina delegam para dois componentes. Abri os dois:

- **`TabsList` (`super-admin.tsx:16`, sem `flex-wrap`):** "Empresas" 82px + "Tickets" 75px + `p-1` 8px = **165px contra 328px**. Cabe com folga de 163px. Ao contrario do `/minha-conta`, sao duas abas curtas.
- **`companies-dashboard.tsx`:** tabela ja em `overflow-x-auto` (`:36`). Os botoes "Impersonar" e "Desativar" (`:59` e `:62`) vivem **dentro** de uma celda dessa tabela, entao sao cobertos pelo scroll horizontal do container e nao pressionam a pagina.
- **`support-tickets-dashboard.tsx`:** o card de ticket (`:36`) ja usa o padrao correto, `min-w-0 flex-1` no bloco de texto e `shrink-0` no bloco de acoes. O `SelectTrigger` e `w-28` (112px) contra 256px disponiveis dentro do card. Sem pressao.

### 5.3 `/gestao` - sem acao alem de 3.3 e 3.4

Abas verificadas uma a uma:

| Aba | Componente | Veredito |
|---|---|---|
| Vendedores | `sellers-tab.tsx` | tabela ja em `overflow-x-auto` (`:81`). O `SelectTrigger className="w-64"` de `:200` mede 256px dentro de um `CardContent` de 280px: **cabe**, com 24px de folga. Sem acao |
| Metas | `goals-manager.tsx` | corrigido em 3.3 |
| Scripts | `scripts-manager.tsx` | `:119` tem busca `flex-1` mais um `<select>` nativo de cerca de 135px: o campo elastico absorve. `:109`, `:150` e `:165` sao botoes pequenos com `shrink-0`. Sem acao |
| Auto-Reply | `auto-reply-settings.tsx` | `:92` e um toggle mais um rotulo curto. O `textarea` e `w-full`. Sem acao |
| Relatorios | `reports-tab.tsx` | corrigido em 3.4 |
| Logs comerciais | `activity-logs-dashboard.tsx` | `:31` usa `w-16 shrink-0` no horario, `shrink-0` no badge e `truncate flex-1` no metadata. Soma cerca de 200px de fixos em 256px, com o resto truncando. Sem acao |

### 5.4 `/admin` - sem acao alem de 4.1 e 4.2

| Aba | Componente | Veredito |
|---|---|---|
| Integracoes | `integrations-tab.tsx` | defensiva em 4.2. O cabecalho `:47` e `justify-between` com um badge que quebra linha internamente: 230px em 280px. Sem acao |
| Pipeline | `pipeline-tab.tsx` e 5 filhos | so composicao. `stage-manager-inline.tsx:42` e `:123`, `pipeline-list-manager.tsx:201` e `lead-sources-manager.tsx:113` e `:130` **ja usam `flex-1` no campo elastico com `shrink-0` nos icones**, que e o padrao correto. `pipeline-routing-rules-manager.tsx:161` **ja e `flex flex-col gap-2 sm:flex-row`** e `:167` **ja e `sm:w-52`**: alguem ja tratou essa area. Sem acao |
| Regras | `business-rules-tab.tsx` | `:256` ja usa `min-w-0 flex-1` no texto e `shrink-0` nas acoes. Sem acao |
| Empresa | `EmpresaTab`, em `admin.tsx:22` | ja e `grid gap-4 sm:grid-cols-2`. Sem acao |
| Aparencia | `theme-customizer.tsx` | defensiva em 4.1. A grade `:187` (`grid-cols-3` dos temas) **foi medida e mantida na Fase 2**: 85px por botao para um texto de 48px. Sem acao |
| Logs avancados | `activity-logs-dashboard.tsx` | mesmo componente do `/gestao`. Sem acao |

### 5.5 `/minha-conta` - sem acao alem de 3.1

| Aba | Componente | Veredito |
|---|---|---|
| Perfil | `profile-settings.tsx` | `:117` tem "Salvar Perfil" (116px) e "Alterar Senha" (120px) mais `gap-3`: **248px em 280px, cabe**. Diferente do `reports-tab`, que tem tres botoes e rotulos mais longos. Sem acao |
| Scripts | `scripts-manager.tsx` | mesmo do `/gestao`. Sem acao |
| Notificacoes | `notification-preferences.tsx` | `:33` e `justify-between` com texto que quebra linha e um toggle de 36px. Sem acao |
| Meus Relatorios | `personal-reports.tsx` | `:42` ja e `grid gap-4 sm:grid-cols-2`. O `TabsList` de `:33` (7d, 30d, 90d) mede cerca de 146px. Sem acao |

---

## 6. Fora do escopo desta fase (nao tocar)

Listado explicitamente para nao haver duvida durante a implementacao.

**Telas medias, Fase 4:**
- `overflow-x-auto` na tabela de `deals.tsx`, e a de `result-step.tsx`.
- Altura de `/tarefas` (`max-h-[calc(100vh-280px)]`, `tarefas.tsx:62`).
- Legibilidade dos graficos Recharts do `dashboard.tsx` em 360px.
- O aperto do breakdown dos KPI cards de `/deals` na faixa 640px a 1024px, registrado na Spec da Fase 2.

Mesmo que apareçam no caminho, sao Fase 4.

**Telas complexas, Fase 5:**
- `/pipeline` e `/inbox`, e **qualquer componente delas**, incluindo `contact-panel.tsx` e `edit-lead-modal.tsx` (o `TabsList` de 3 abas que estoura cerca de 9px, registrado na Spec da Fase 2, continua pendente e **nao e resolvido aqui**).

**Globais ja entregues:**
- Os 5 arquivos do shell da Fase 1: `main-layout.tsx`, `app-sidebar.tsx`, `mobile-topbar.tsx`, `sheet.tsx`, `use-mobile.ts`.
- `dialog.tsx` e demais globais da Fase 2: o padding ja aplicado nas 11 rotas e os grids ja corrigidos.

**Sempre fora:**
- `src/stores/inbox.store.ts`
- `src/styles/globals.css`
- Qualquer arquivo em `supabase/`

---

## 7. Arquivos afetados

**7 arquivos**, agrupados por arquivo para o diff sair limpo:

| # | Arquivo | Linhas | Itens |
|---|---|---|---|
| 1 | `src/pages/minha-conta.tsx` | `:17` | 3.1 |
| 2 | `src/pages/sdr-ia.tsx` | `:64`, `:66` | 3.2 |
| 3 | `src/components/gestao/goals-manager.tsx` | `:414`, `:434`, `:445`, `:462`, `:486` | 3.3 |
| 4 | `src/components/admin/reports-tab.tsx` | `:16` | 3.4 |
| 5 | `src/components/company/theme-customizer.tsx` | `:284` | 4.1 |
| 6 | `src/components/admin/integrations-tab.tsx` | `:120` | 4.2 |
| 7 | `docs/SPEC-responsividade-fase3.md` | novo | esta Spec |

Total de 10 alteracoes de classe. Nenhum arquivo criado alem da Spec, nenhuma linha de logica tocada, nenhum token ou CSS var novo.

**Ordem sugerida:** 1, 2, 3, 4, 5, 6. Rodar `npm run build` depois do item 3 e ao final.

---

## 8. Verificacao

### 8.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida |
| 2 | `npm run build` | sem erro |
| 3 | `npm run lint` | **medir o baseline antes de editar** (`git stash -u`). Reportar "zero erro novo em relacao ao baseline", nunca "zero erro": a `develop` ja carrega erros pre-existentes, e o numero subiu entre a Fase 1 e a Fase 2 por causa de merges de outras frentes |
| 4 | `git status` | nada em `supabase/`, `src/stores/`, `src/styles/`, nos 5 arquivos do shell, em `dialog.tsx`, em `src/pages/deals.tsx`, `tarefas.tsx`, `dashboard.tsx`, `pipeline.tsx`, `inbox.tsx` |
| 5 | `git ls-files docs/SPEC-responsividade-fase3.md` | tem que retornar o caminho. Se voltar vazio, o arquivo esta untracked e **nao vai no commit**, que e exatamente o que aconteceu com os documentos da Fase 1 |

### 8.2 Manual, em 360px, 390px e 414px

| # | Verificacao | Criterio do PRD |
|---|---|---|
| 6 | `/minha-conta`: as 4 abas quebram em duas linhas, nenhuma cortada, `<body>` sem scroll horizontal | 1, 14 |
| 7 | `/sdr-ia` aba Configuracao: select de pipeline ocupa a largura toda e o nome do pipeline fica legivel; botoes Ativar/Editar na linha de baixo | 14 |
| 8 | `/gestao` aba Metas: abrir "Nova Meta", adicionar 2 metricas, trocar escopo para "Individual". Os 4 campos empilham, os rotulos dos selects ficam legiveis, a lixeira fica compacta a direita | 14 |
| 9 | `/gestao` aba Relatorios: os 3 botoes de exportacao ficam visiveis sem scroll horizontal | 1 |
| 10 | `/admin` abas Aparencia e Integracoes: confirmar se os botoes **de fato** estouravam antes (medicao marginal, 4.1 e 4.2). Registrar o resultado, mesmo que a resposta seja "cabia" | 1 |
| 11 | `/contatos` e `/super-admin`: confirmar visualmente o veredito "sem acao" das secoes 5.1 e 5.2 | 1 |

O item 10 e o unico que pode invalidar uma decisao desta Spec. Se os dois casos marginais nao estouravam, o `flex-wrap` continua inerte e nao ha o que desfazer, mas vale corrigir o registro.

### 8.3 Nao regressao em desktop (1280px)

| # | Verificacao |
|---|---|
| 12 | `/minha-conta`: 4 abas numa unica linha, como hoje |
| 13 | `/sdr-ia`: select em 256px na mesma linha dos botoes |
| 14 | `/gestao` Metas: linha de metrica em coluna unica horizontal, com os campos em 96, 128 e 160px |
| 15 | `/gestao` Relatorios, `/admin` Aparencia e Integracoes: botoes em linha unica |
| 16 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie. Esta fase nao toca em token nem em CSS var |

---

## 9. Pendencias registradas, fora do escopo

| Pendencia | Onde | Destino |
|---|---|---|
| `TabsList` de 3 abas estoura cerca de 9px em 390px | `edit-lead-modal.tsx:215` | Fase 5 (pipeline) |
| Breakdown dos KPI cards aperta entre 640px e 1024px | `deals.tsx:293`, `:337` | passada futura em `/deals` |
| `alert-dialog.tsx` tem o mesmo problema de `max-h` que o `dialog.tsx` teve | `src/components/ui/alert-dialog.tsx` | avaliar depois |
| Campos Instagram e LinkedIn em 2 colunas no painel de 340px | `contact-panel.tsx:320` | Fase 5 (inbox) |
| `inbox.store.ts:32` le `matchMedia` uma unica vez, sem listener | `src/stores/inbox.store.ts` | ciclo do inbox |
| Campo de busca `w-56` desperdica 104px em 360px | `contatos.tsx:80` | estetica, nao quebra. So se houver passada de polimento |
| Valores longos do `InfoItem` sem `truncate` | `sdr-ia.tsx:147` | estetica, nao quebra |
