# PRD - Responsividade Mobile

**Status:** Pesquisa concluida, aguardando aprovacao para implementar
**Escopo:** Frontend apenas. Sem mudanca de schema, sem dados pessoais, sem mudanca de regra de negocio.

---

## 1. Estado atual

### 1.1 Layout shell

O shell e `src/components/layout/main-layout.tsx` (20 linhas):

```tsx
<div className="flex h-screen overflow-hidden">
  <AppSidebar />
  <main className="min-w-0 flex-1 overflow-y-auto scrollbar-minimal">
    <Outlet />
  </main>
  <ErrorReportButton />
</div>
```

E montado em `src/App.tsx:81-102` como layout route de todas as rotas autenticadas.

**Nao existe header/topbar compartilhado.** Nao ha nenhum componente `PageHeader` no projeto: cada pagina renderiza o proprio cabecalho inline. Isso e relevante porque o botao hamburguer precisa de um lugar para morar, e hoje esse lugar nao existe.

### 1.2 A sidebar

Vive em `src/components/layout/app-sidebar.tsx` (230 linhas). E um **componente proprio**, escrito a mao com `<aside>` + `NavLink` do react-router. Nao usa nenhum primitivo de sidebar.

A causa raiz do problema esta na linha 91:

```
'flex h-screen w-64 flex-col border-r border-sidebar-border text-sidebar-foreground'
```

`w-64` (256px) fixo, **sem nenhum prefixo de breakpoint e sem estado de aberto/fechado**. Nao existe estado de colapso em lugar nenhum: nem no componente, nem em store Zustand, nem em contexto. A sidebar sempre ocupa 256px, em qualquer viewport.

Como o shell e `flex` com `overflow-hidden`, em um viewport de 390px sobram 134px para todo o conteudo da aplicacao.

A sidebar concentra bastante coisa alem da navegacao, e isso pesa na decisao da secao 3:
- bloco de marca + nome da empresa
- nav com 10 itens condicionados por role (`useRoles`) e feature flag (`useFeatureFlag('sdr_agent_v2')`)
- badge de tarefas atrasadas (`useMyTaskCounts`)
- bloco "Usuarios online" visivel so para admin/manager (`useTeamMembers` + calculo de `last_seen_at`)
- `ThemeToggle` + `NotificationCenter`
- dropdown de perfil (minha conta / sair)
- toggle de disponibilidade com Tooltip
- variante visual `sidebar-glass` controlada por `useThemeSettings()`

### 1.3 Sidebar do shadcn/ui: nao esta instalado

Inventario de `src/components/ui/` (20 arquivos):

```
alert-dialog  avatar  button  card  checkbox  currency-input  dialog
dropdown-menu  input  label  phone-input  popover  progress  select
separator  skeleton  sonner  switch  tabs  tooltip
```

**Nao ha `sidebar.tsx` e nao ha `sheet.tsx`.** O `sheet` do shadcn e pre-requisito do `sidebar` (e o que faz o drawer no mobile).

O que existe a favor:
- `@radix-ui/react-dialog@^1.1.15` ja esta no `package.json`. O `sheet` e construido sobre esse mesmo primitivo, entao **adicionar o sheet nao adiciona dependencia nova**.
- As CSS vars `--sidebar-background`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border` ja existem em `src/styles/globals.css`, nos tres temas (light `:28`, dark `:66`, sand `:104`).
- Faltam tres vars que o `sidebar.tsx` do shadcn espera: `--sidebar-primary-foreground`, `--sidebar-accent-foreground`, `--sidebar-ring`.

Padrao de drawer feito a mao ja existe em `src/components/admin/automation-logs-drawer.tsx`: `fixed inset-0 z-50 flex justify-end` + backdrop clicavel + painel `max-w-md`. Funciona, mas nao tem focus trap, nao fecha no Esc e nao trava o scroll do body.

### 1.4 Breakpoints em uso

Config em `tailwind.config.ts`: escala padrao do Tailwind, com apenas `container.screens['2xl'] = 1400px` customizado. Nada mais foi redefinido.

Uso real no codigo:

| Breakpoint | Ocorrencias | Onde |
|---|---|---|
| `sm:` (640px) | 69 | disperso, e o unico com uso consistente |
| `md:` (768px) | 3 | so em `dashboard.tsx` (grids) |
| `lg:` (1024px) | 10 | grids de cards em dashboard, sdr-ia, sellers, tarefas |
| `xl:` (1280px) | 5 | exclusivamente `inbox.tsx`, para o contact panel |
| `2xl:` | 0 | nenhum |

**Existe um padrao, mas parcial:** `sm:` e usado para empilhar/desempilhar (`flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-3`) e `lg:` para densificar grids de cards. O `md:` e residual. O `xl:` e um caso isolado do inbox.

`docs/DESIGN_SYSTEM.md:268-278` ja documenta a escala, mas nao define qual e o corte mobile do produto. Essa lacuna e o que este PRD fecha.

Nao ha nenhuma regra responsiva aplicada ao shell. Todos os 87 usos de breakpoint estao dentro de paginas e componentes de conteudo.

### 1.5 Padroes reutilizaveis existentes

Varri os 57 hooks em `src/hooks/`. **Nao existe `use-mobile`, `useMediaQuery`, `useBreakpoint` nem equivalente.**

A unica logica de viewport do projeto inteiro esta em `src/stores/inbox.store.ts:32`:

```ts
contactPanelOpen: typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(min-width: 1280px)').matches,
```

Isso e avaliado **uma unica vez, na criacao do store**. Nao ha listener: girar o dispositivo ou redimensionar a janela nao atualiza o valor. Ja e um bug latente hoje e vira um bug visivel quando o mobile for suportado de verdade.

`src/hooks/use-debounced-value.ts` existe e pode ser util para handlers de resize, se precisarmos.

**Conclusao: nao ha nada reaproveitavel para responsividade. A fundacao precisa ser construida.**

### 1.6 Outros achados que afetam o mobile

- `index.html:5` ja tem `<meta name="viewport" content="width=device-width, initial-scale=1.0">`. Correto, nao precisa mexer.
- `src/components/ui/dialog.tsx:36`: `w-full max-w-lg` sem `max-h` e sem scroll interno. O `w-full` salva a largura, mas **modais altos estouram verticalmente no mobile** e o conteudo fica inalcancavel. Afeta todos os modais do produto (criar tarefa, editar lead, novo contato, convidar membro).
- 8 arquivos usam `<table>`. Seis ja estao envolvidos em `overflow-x-auto` (contatos, sellers-tab, seller-performance-table, companies-dashboard, SdrV2Dashboard, preview-step). `deals.tsx` e `result-step.tsx` **nao estao**.
- 14 ocorrencias de `grid-cols-2/3/4` sem prefixo de breakpoint, ou seja, mantem 3 ou 4 colunas em 360px. Concentradas em `deals.tsx` (3x), `create-task-modal.tsx`, `edit-task-modal.tsx`, `goals-manager.tsx`, `theme-customizer.tsx`, `color-picker.tsx`, `contact-panel.tsx`, `dashboard.tsx:128`.
- Paginas usam `p-6` (24px) fixo de padding. No mobile deveria ser `p-4`.

---

## 2. Telas afetadas

Rotas dentro do `MainLayout` (todas herdam o problema do shell). Classifiquei por esforco alem da correcao do shell:

| Rota | Arquivo | Complexidade | Problema especifico |
|---|---|---|---|
| `/inbox` | `pages/inbox.tsx` | **Alta** | Master-detail de 3 colunas. Lista `w-[340px] min-w-[300px] shrink-0` + chat + painel. Precisa virar navegacao lista/conversa no mobile |
| `/pipeline` | `pages/pipeline.tsx` + `components/pipeline/pipeline-board.tsx` | **Alta** | Kanban com colunas `w-[300px] min-w-[280px]`. O track ja tem `overflow-x-auto` (board:280), entao sobrevive. O risco real e o drag & drop do dnd-kit em touch |
| `/deals` | `pages/deals.tsx` (528 linhas) | **Media** | 3x `grid-cols-3` sem breakpoint (`:268`, `:293`, `:337`); tabela sem `overflow-x-auto` |
| `/tarefas` | `pages/tarefas.tsx` (379 linhas) | **Media** | Colunas de status lado a lado; `max-h-[calc(100vh-280px)]` (`:62`) calculado para desktop |
| `/` (dashboard) | `pages/dashboard.tsx` (364 linhas) | **Media** | Ja tem `md:`/`lg:` nos grids principais, mas `grid-cols-3` fixo em `:128` |
| `/contatos` | `pages/contatos.tsx` | **Baixa** | Tabela ja tem `overflow-x-auto` (`:140`). So padding e cabecalho |
| `/gestao` | `pages/gestao.tsx` | **Baixa** | `TabsList` ja usa `flex-wrap h-auto` (`:19`). Conteudo das abas precisa revisao |
| `/admin` | `pages/admin.tsx` | **Baixa** | Mesmo padrao de tabs; grid ja e `sm:grid-cols-2` |
| `/super-admin` | `pages/super-admin.tsx` | **Baixa** | 37 linhas, delega para componentes |
| `/sdr-ia` | `pages/sdr-ia.tsx` | **Baixa** | `SelectTrigger className="w-64"` fixo (`:66`); grid ja responsivo |
| `/minha-conta` | `pages/minha-conta.tsx` | **Baixa** | 40 linhas, so padding |

**Fora do `MainLayout`** (nao tem sidebar, ja sao telas centradas e em boa forma): `/auth`, `/auth/cadastro`, `/aceitar-convite`, `/acesso-negado`, `/privacidade`, `/termos`, `/update-password`. Vale uma passada de verificacao rapida, nao de reescrita.

---

## 3. Estrategia recomendada

### Decisao: consertar a sidebar atual, adicionando apenas `sheet.tsx` e `use-mobile.ts`

Avaliei as duas opcoes com seriedade.

**Opcao A: adotar o `sidebar.tsx` do shadcn/ui**

A favor: o colapso em Sheet ja vem pronto e testado; traz de brinde modo icone, rail de arraste e persistencia por cookie; e o caminho que a comunidade valida.

Contra:
- E um primitivo de ~700 linhas com API propria (`SidebarProvider`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuBadge`, `SidebarFooter`, `SidebarInset`). Adotar significa **reescrever as 230 linhas da `app-sidebar.tsx` inteira** para caber nessa API.
- Os sete blocos listados em 1.2 (usuarios online, toggle de disponibilidade com Tooltip, NotificationCenter, dropdown de perfil, badge de atrasadas) nao mapeiam de forma limpa para os slots do primitivo. Boa parte viraria `children` solto dentro de `SidebarGroup`, que e exatamente o que temos hoje, so que com uma camada de indirecao a mais.
- A variante `sidebar-glass` aplica `background: hsl(var(--sidebar-background) / 0.65)` + backdrop-filter direto no `<aside>` (`globals.css:184`). O primitivo do shadcn controla esse elemento e aplica as proprias classes de fundo, entao a variante teria que ser reencaixada.
- Faltam 3 CSS vars do contrato (`--sidebar-primary-foreground`, `--sidebar-accent-foreground`, `--sidebar-ring`), e elas teriam que ser definidas nos **tres** temas (light, dark, sand).
- Traz superficie que o produto nao pediu: modo icone e rail nao estao no escopo.

**Opcao B (recomendada): manter a `app-sidebar.tsx` e adicionar so o que falta**

O trabalho real e pequeno e bem delimitado:
1. Adicionar `src/components/ui/sheet.tsx` (shadcn padrao, sem dependencia nova: o `@radix-ui/react-dialog` ja esta instalado).
2. Criar `src/hooks/use-mobile.ts` com `matchMedia` **e listener**, seguindo a convencao de um hook por arquivo do CLAUDE.md.
3. Extrair o conteudo atual da sidebar para `<SidebarContent />` e renderiza-lo em dois lugares: `<aside className="hidden lg:flex ...">` no desktop e dentro de um `<Sheet>` no mobile. O JSX interno **nao muda**.
4. Criar `src/components/layout/mobile-topbar.tsx` com o hamburguer, ja que nao existe header compartilhado.

**Por que essa e a recomendacao:** o problema relatado e especifico (a sidebar nao colapsa), e a opcao B resolve exatamente isso preservando toda a logica de roles, feature flags, presenca e temas que ja funciona e ja foi testada em producao. A opcao A entrega a mesma experiencia final ao usuario, mas exige reescrever um componente estavel de 230 linhas e reencaixar a variante glass nos tres temas, criando risco de regressao visual em area que ninguem pediu para mexer. Ganhamos o mesmo drawer com uma fracao do risco.

O `sheet.tsx` que entra e o mesmo do shadcn, entao a porta para migrar para o `sidebar.tsx` completo continua aberta se um dia quisermos modo icone ou rail.

### Breakpoint de corte: `lg` (1024px)

A sidebar vira drawer **abaixo de 1024px** (`hidden lg:flex` no aside, hamburguer com `lg:hidden`).

A conta que sustenta a escolha, usando o inbox como pior caso (a tela mais apertada do produto):

| Viewport | Sidebar | Lista conversas | Sobra para o chat | Situacao |
|---|---|---|---|---|
| 1280px (`xl`) | 256 | 340 | 684 | confortavel, cabe o contact panel inline |
| 1024px (`lg`) | 256 | 340 | 428 | limite aceitavel |
| 768px (`md`) | 256 | 340 | **172** | inutilizavel |
| 390px | 256 | 340 | **negativo** | quebra |

`md` (768px) deixaria 172px para a conversa, o que nao serve. `lg` e o ultimo ponto em que a sidebar fixa ainda se paga. Escolher `lg` tambem conversa com o `xl:` que o inbox ja usa para o contact panel: os dois degraus ficam coerentes (`xl` solta o painel, `lg` solta a sidebar).

Para o conteudo interno das paginas, mantemos o padrao que ja emergiu no codigo: **`sm` (640px) para empilhar/desempilhar, `lg` para densificar grids.** Evitar `md` em conteudo novo, para nao espalhar um terceiro degrau com uso residual.

### Comportamento esperado da sidebar no mobile

Abaixo de `lg`:
- A `<aside>` fixa some (`hidden lg:flex`).
- Um topbar fino aparece (`lg:hidden`), sticky no topo, com: hamburguer a esquerda, marca/nome da empresa ao centro ou a esquerda, e `NotificationCenter` a direita.
- Tocar no hamburguer abre um `Sheet side="left"` com **exatamente o mesmo conteudo** da sidebar de desktop (mesma nav, mesmas roles, mesmo bloco de usuarios online, mesmo rodape de perfil).
- Drawer **sobreposto** ao conteudo, com backdrop escurecido. Nao empurra o layout.
- Largura do drawer: `w-[280px]`, teto `max-w-[85vw]`.
- Fecha ao: tocar num item de navegacao, tocar no backdrop, pressionar Esc, ou arrastar para a esquerda. O Radix Dialog entrega backdrop e Esc de graca. O fechamento ao navegar precisa ser explicito, via `onClick` no `NavLink`.
- Enquanto aberto: focus trap e scroll do body travado (ambos vem do Radix, ao contrario do drawer manual de 1.3).
- Em `lg` e acima nada muda em relacao a hoje.

---

## 4. Ordem de implementacao

Sequencia deliberada: a fundacao primeiro (destrava todas as telas de uma vez), depois da mais barata para a mais cara, deixando inbox e pipeline por ultimo porque sao as unicas que exigem decisao de UX de verdade.

**Fase 1 - Fundacao (destrava tudo)**
1. `src/hooks/use-mobile.ts`: `useIsMobile()` com `matchMedia` + `addEventListener('change')`, guarda de SSR, e corrigir `inbox.store.ts:32` para nao depender mais de leitura unica.
2. `src/components/ui/sheet.tsx`: shadcn padrao sobre `@radix-ui/react-dialog`.
3. `app-sidebar.tsx`: extrair `<SidebarContent />`, aplicar `hidden lg:flex` no `<aside>`, envolver no `<Sheet>` para mobile, fechar ao navegar.
4. `src/components/layout/mobile-topbar.tsx`: novo, com hamburguer + marca + NotificationCenter.
5. `main-layout.tsx`: montar o topbar acima do `<main>` e mover o estado de abertura do drawer para ca.

*Marco: nenhuma tela mais tem scroll horizontal causado pelo shell.*

**Fase 2 - Ajuste global de conteudo**
6. `dialog.tsx`: adicionar `max-h-[90dvh]` + scroll interno + `max-w-[calc(100vw-2rem)]`. Uma correcao, todos os modais do produto resolvidos.
7. Normalizar padding de pagina: `p-4 sm:p-6` nas 11 rotas.
8. Corrigir os 14 `grid-cols-N` sem breakpoint para `grid-cols-1 sm:grid-cols-N` (ou `grid-cols-2 sm:grid-cols-4` onde 1 coluna ficar absurdo).

**Fase 3 - Telas simples**
9. `/minha-conta`, `/contatos`, `/super-admin`, `/sdr-ia` (remover o `w-64` fixo do select em `:66`).
10. `/gestao`, `/admin`: revisar conteudo das abas; `TabsList` ja tem `flex-wrap`.

**Fase 4 - Telas medias**
11. `/` (dashboard): corrigir `grid-cols-3` em `:128`; validar legibilidade dos graficos Recharts em 360px.
12. `/deals`: 3 grids + envolver a tabela em `overflow-x-auto`.
13. `/tarefas`: colunas de status empilhadas ou em scroll horizontal; trocar `max-h-[calc(100vh-280px)]` por altura fluida.

**Fase 5 - Telas complexas**
14. `/pipeline`: o track ja tem `overflow-x-auto`, entao o foco e o toolbar do board e validar o drag & drop do dnd-kit em touch (pode exigir `TouchSensor` com `activationConstraint` para nao competir com o scroll).
15. `/inbox`: a mais cara. Abaixo de `lg`, virar navegacao master-detail: lista ocupa 100% e some ao selecionar uma conversa; chat ocupa 100% com botao voltar no header; contact panel continua overlay (o `xl:` atual ja cobre isso). Estado derivado de `selectedLeadId`, que ja existe no `inbox.store`.

**Fase 6 - Verificacao**
16. Passada nas telas publicas (`/auth`, `/aceitar-convite`, `/termos`, `/privacidade`).
17. Varredura final nos viewports alvo.

---

## 5. Fora de escopo nesta fase

- Mudanca de schema, migration ou qualquer alteracao no Supabase.
- Qualquer tratamento de dados pessoais.
- Adotar o `sidebar.tsx` completo do shadcn, modo icone e rail de arraste.
- Persistir estado de colapso da sidebar (cookie ou localStorage). No desktop ela e sempre visivel; no mobile o drawer sempre comeca fechado.
- PWA, manifest, instalacao, offline, notificacoes push.
- Gestos nativos alem do que o Radix ja entrega (swipe para abrir a partir da borda, pull-to-refresh).
- Redesenhar o kanban para uma metafora mobile propria (tipo uma coluna por vez com abas). Nesta fase o scroll horizontal do board permanece.
- Tabelas viram cards no mobile. Nesta fase permanece scroll horizontal.
- Otimizacao de performance, code splitting, virtualizacao de lista.
- Traducao ou i18n.
- Mudanca de identidade visual, tokens ou temas. Os tres temas continuam como estao.
- Testes automatizados de responsividade (Playwright em viewports). Validacao nesta fase e manual.

---

## 6. Criterios de aceite

**Shell e sidebar**
1. Em 360px, 390px e 414px de largura, nenhuma das 11 rotas autenticadas apresenta scroll horizontal no `<body>`.
2. Abaixo de 1024px a `<aside>` fixa nao ocupa espaco no fluxo e o conteudo usa 100% da largura util.
3. Em 1024px e acima o layout e visualmente identico ao de hoje (nenhuma regressao no desktop).
4. O hamburguer aparece so abaixo de 1024px e abre o drawer da esquerda com backdrop.
5. O drawer mostra os mesmos itens de navegacao da sidebar de desktop, respeitando role e a feature flag `sdr_agent_v2`.
6. O drawer fecha ao: tocar num item de nav, tocar no backdrop e pressionar Esc.
7. Com o drawer aberto, o conteudo atras nao rola e o foco fica preso dentro do drawer.
8. Redimensionar de 1200px para 800px e voltar nao deixa o layout em estado inconsistente (valida o listener do `use-mobile`).
9. A variante `sidebar-glass` continua correta nos tres temas, no desktop e dentro do drawer.

**Conteudo**
10. Nenhum `grid-cols-3` ou `grid-cols-4` permanece ativo abaixo de 640px.
11. Todo modal cabe na viewport em 390px de largura por 640px de altura, com o conteudo alcancavel por scroll interno e os botoes de acao sempre atingiveis.
12. Todas as 8 tabelas estao em container com `overflow-x-auto`, e a pagina em volta nao rola horizontalmente.
13. Alvos de toque (botoes de icone, itens de nav, toggles) tem no minimo 44x44px de area clicavel no mobile.
14. Nenhum texto fica truncado de forma ilegivel nem estoura o container em 360px.

**Inbox e pipeline**
15. Em `/inbox` abaixo de 1024px: a lista ocupa a largura toda; selecionar uma conversa mostra o chat em tela cheia com botao voltar funcional; o contact panel abre como overlay.
16. Em `/pipeline` abaixo de 1024px: o board rola horizontalmente e o drag & drop de cards funciona por toque sem conflitar com o scroll.

**Geral**
17. `npm run build` e `npm run lint` passam limpos.
18. Zero `any` introduzido; nenhuma cor hardcoded (so tokens semanticos), conforme CLAUDE.md.
19. Nenhum arquivo em `supabase/` foi tocado.
