# Spec - Responsividade Mobile, Fase 5A (/inbox)

**Branch:** `feature/responsividade-mobile-inbox`
**Base:** `develop` em `1b167d5` (Fases 1 a 4 mergeadas, PRs #142, #143, #144 e #145)
**Escopo:** APENAS `/inbox`. O `/pipeline` e branch separada e **nao entra aqui**.
**PRD de origem:** `docs/PRD-responsividade.md`, secao 4 Fase 5 item 15, secao 2 (linha `/inbox`) e secao 5.

**Emenda de 2026-08-04, apos review da implementacao.** Tres correcoes na propria Spec, achadas revisando o codigo entregue. Nenhuma delas e defeito de implementacao: a codificadora seguiu a Spec fielmente, e a Spec e que estava errada em dois pontos.

| # | O que mudou | Onde |
|---|---|---|
| **E1** | O botao voltar da tela fazia `navigate('/inbox')` com **push**, o que faz o voltar do sistema **reabrir a conversa**. Corrigido para voltar de verdade quando veio da lista | 4.3, 4.4 |
| **E2** | A justificativa de `hidden`/`block` afirmava que a posicao de scroll da lista sobrevive. **Nao sobrevive**: `display:none` zera o `scrollTop`. Os filtros sobrevivem, porque estao no Zustand | 4.1.2, criterio 19 |
| **E3** | `/inbox/<id-invalido>` no mobile deixa o usuario sem lista e sem botao voltar na tela | secao 9, pendencia 8 |

---

## 0. Resumo executivo

As duas decisoes de UX do produto **se sustentam apos a medicao**. Nenhuma foi contrariada. Mas a investigacao mudou o tamanho e a forma de tres coisas, e uma delas e uma colisao de escopo que precisa de decisao antes da implementacao.

| Ponto | O que a medicao mostrou |
|---|---|
| **Decisao 1** (painel como segundo nivel) | **Ja esta implementada.** A infra de overlay existe e funciona. O trabalho real e outro: `inbox.tsx` monta **duas instancias simultaneas** do `ContactPanel`, e isso e risco de corrida de escrita, nao so desperdicio |
| **Decisao 2** (rota de verdade) | **Viavel e pequena.** So **2 arquivos de producao** consomem o `selectedLeadId` do inbox store. Ja existe infra parcial de URL (`?lead=`) |
| **Colisao de escopo** | **4 arquivos linkam para `/inbox?lead=<id>`, e um deles esta em area proibida** (`src/components/pipeline/`). Resolvivel sem tocar em nenhum dos 4. Detalhe na secao 8.1 |
| Fix do `inbox.store.ts:32` | Exige uma media query reativa em **1280px**, e o `use-mobile.ts` da Fase 1 e **1024px** e nao pode ser modificado. Precisa de 1 hook novo |
| Breakpoint do painel | **Confirmado que deve continuar `xl`.** Medi a alternativa `lg` e ela e inviavel: sobrariam 68px para o chat |

**Total: 7 arquivos de codigo, 1 arquivo novo (hook), 1 arquivo de teste.** Nenhuma alteracao na logica de mensagens, realtime ou envio.

---

## 1. Metodo de medicao

Mesma metodologia das Specs das Fases 3 e 4.

**Diferenca importante em relacao as fases anteriores: `/inbox` nao tem padding de pagina.** A raiz (`inbox.tsx:48`) e `flex h-full relative`, sem `p-4 sm:p-6`. A Fase 2 nao aplicou padding aqui, e corretamente: e uma tela de paineis colados, nao de conteudo. Entao a largura disponivel e a largura cheia do `<main>`.

**Larguras do `<main>` por viewport**, considerando que a sidebar so ocupa fluxo a partir de `lg` (Fase 1) e que ela e `w-64` (256px):

| Viewport | Sidebar no fluxo | `<main>` disponivel |
|---|---|---|
| 360px | nao (drawer) | **360px** |
| 390px | nao | **390px** |
| 768px | nao | **768px** |
| 1024px (`lg`) | sim, 256px | **768px** |
| 1280px (`xl`) | sim | **1024px** |
| 1440px | sim | **1184px** |

**Altura**, que importa no chat em tela cheia: `MainLayout` e `h-screen overflow-hidden`, com `MobileTopbar` de `h-14` (56px) acima do `<main>` abaixo de `lg`. Em um aparelho de 640px de altura, o `<main>` fica com **584px**.

---

## 2. Estado atual medido

### 2.1 A quebra principal

`inbox.tsx:48` a `:58`:

```tsx
<div className="flex h-full relative">
  <div className="w-[340px] min-w-[300px] shrink-0">
    <ConversationList />
  </div>
  <div className="flex-1 min-w-0">
    {selectedLead ? <ChatWindow lead={selectedLead} /> : <EmptyInbox />}
  </div>
```

A lista e `w-[340px]` com **`shrink-0`**, ou seja, nao cede um pixel. O chat e `flex-1 min-w-0`, ou seja, cede tudo.

| Viewport | Lista | Sobra para o chat |
|---|---|---|
| 360px | 340 | **20px** |
| 390px | 340 | **50px** |
| 768px | 340 | 428px |
| 1024px (`main` 768) | 340 | 428px |
| 1280px (`main` 1024, com painel inline 360) | 340 | 324px |

**20px para a janela de conversa em 360px.** Nao ha scroll horizontal no `<body>` porque o `min-w-0` do `MainLayout` (Fase 1) contem o estouro, mas o chat e simplesmente inutilizavel. E a pior tela do produto no mobile, como o PRD previu.

### 2.2 O painel de contato hoje

`inbox.tsx:60` a `:82`. Quando `showPanel` e verdadeiro, o JSX renderiza **tres** elementos:

```tsx
:64  <div className="absolute inset-0 z-30 bg-black/20 xl:hidden" onClick={...} />   // backdrop
:68  <div className="hidden xl:block xl:relative xl:w-[360px]">                       // coluna inline
:75    <ContactPanel lead={selectedLead} />
:78  <div className="absolute right-0 top-0 bottom-0 z-40 w-[340px] max-w-[85vw] xl:hidden">  // overlay
:79    <ContactPanel lead={selectedLead} />
```

**A infra de overlay que a Decisao 1 pede ja existe, na linha 78.** Backdrop clicavel, largura `w-[340px] max-w-[85vw]`, alternancia por `xl:`. O botao que abre tambem ja existe: `chat-header.tsx:61` a `:69`, um `PanelRight` ligado a `toggleContactPanel`, **sem nenhum prefixo de breakpoint**, portanto ja visivel no mobile hoje.

**A Decisao 1, na pratica, ja esta implementada.** O que ela exige desta fase e apenas que continue funcionando quando o chat passar a ocupar 100% da largura, mais o conserto da secao 4.1.

### 2.3 O breakpoint do painel deve continuar `xl`. Medi a alternativa

Ha uma tensao aparente: o painel usa `xl` (1280px) enquanto o resto do produto padronizou `lg` (1024px), e o `use-mobile.ts` da Fase 1 corta em 1023,98px. A tentacao seria unificar tudo em `lg`.

**Medi, e `lg` e inviavel.** Em 1024px o `<main>` tem 768px:

```
lista 340 + painel inline 360 = 700px de larguras fixas
sobra para o chat = 68px
```

**68px para a conversa.** Pior que os 20px de hoje em 360px, e num viewport de desktop. O painel tem que continuar soltando em `xl`, exatamente como o PRD antecipou na secao 3 ("`xl` solta o painel, `lg` solta a sidebar"). Os dois degraus sao deliberados e nao devem ser unificados.

**Consequencia para o hook:** o fix do `inbox.store.ts:32` precisa de uma media query reativa em **1280px**, e o `use-mobile.ts` responde 1024px e **nao pode ser modificado** (arquivo do shell da Fase 1). Dai o hook novo da secao 5.

---

## 3. Decisao 2 - investigacao da rota, reportada antes de especificar

O pedido determinou investigar e reportar o tamanho real antes de especificar. Segue a medicao.

### 3.1 O `selectedLeadId` do inbox store tem alcance muito menor que o grep sugere

Um `grep` por `selectedLeadId` retorna 30 ocorrencias em 6 arquivos, o que a primeira vista parece grande demais para esta fase. **A maioria e de outros estados com o mesmo nome:**

| Arquivo | De onde vem | E do inbox? |
|---|---|---|
| `src/components/pipeline/pipeline-board.tsx` | `usePipelineStore()` (`:60`) | **Nao** |
| `src/stores/pipeline.store.ts` | store do pipeline | **Nao** |
| `src/pages/deals.tsx` | `useState` local (`:65`) | **Nao** |
| `src/pages/inbox.tsx` | `useInboxStore()` (`:17`) | **Sim** |
| `src/components/inbox/conversation-list.tsx` | `useInboxStore()` (`:17`) | **Sim** |
| `src/stores/inbox.store.ts` | definicao | **Sim** |
| `src/stores/inbox.store.test.ts` | so no reset do `beforeEach` (`:6`) | teste |

**Consumidores reais: 2 arquivos de producao.** Contagem exata de leituras e escritas:

| Arquivo | Leituras | Escritas |
|---|---|---|
| `inbox.tsx` | `:28`, `:32`, `:34`, `:41` (4) | `:24` (1, vinda do query param) |
| `conversation-list.tsx` | `:115` (1, para `isSelected`) | `:116` (1, no clique) |
| **total** | **5** | **2** |

**2 escritas em 2 arquivos.** A mudanca e pequena e contida. **Nao ha motivo para parar.**

### 3.2 Ja existe infra de URL, e ela e unidirecional

`inbox.tsx:16` e `:21` a `:26`:

```tsx
const [searchParams] = useSearchParams()
useEffect(() => {
  const leadParam = searchParams.get('lead')
  if (leadParam) setSelectedLeadId(leadParam)
}, [searchParams, setSelectedLeadId])
```

A URL ja consegue **entrar** no inbox via `?lead=<id>`, mas o estado **nunca volta** para a URL. Selecionar uma conversa na lista nao muda a barra de enderecos. E exatamente o meio caminho que a Decisao 2 quer completar, e confirma que o racional do botao voltar do Android esta correto: hoje, com o estado so em memoria, voltar sai do inbox inteiro.

### 3.3 A rota do inbox hoje e uma so

`App.tsx:90`, dentro do bloco de rotas autenticadas que usa `MainLayout` como layout route:

```tsx
<Route path="/inbox" element={<InboxPage />} />
```

`InboxPage` e `lazy()` (`App.tsx:18`). Nenhuma rota filha, nenhum param.

### 3.4 Desenho recomendado: a URL vira a fonte da verdade, o campo sai do store

**Recomendo remover `selectedLeadId` e `setSelectedLeadId` do `inbox.store.ts`**, em vez de sincronizar os dois. Manter o campo no store e espelha-lo a partir da rota criaria duas fontes de verdade para o mesmo dado, que e a classe de bug que esta fase existe para nao introduzir. Com 5 leituras e 2 escritas, remover custa menos que sincronizar.

O que **permanece** no store: `filters`, `unreadCount` e `contactPanelOpen`. Nenhum deles pertence a URL.

---

## 4. Mudancas por arquivo

### 4.1 `src/pages/inbox.tsx` - reescrita do layout e da fonte da verdade

Este e o arquivo com mudanca estrutural real, e a maior parte dela e justificada por um defeito que encontrei no caminho.

#### 4.1.1 O defeito das duas instancias do `ContactPanel`

Como mostrado em 2.2, quando `showPanel` e verdadeiro o JSX monta **duas instancias simultaneas** de `<ContactPanel>`, uma escondida por `hidden xl:block` e outra por `xl:hidden`. **CSS esconde, mas nao desmonta.** As duas montam, executam e mantem estado.

Medi o que ha dentro de cada instancia (`contact-panel.tsx`, 19,7 KB):

| Recurso | Quantidade |
|---|---|
| hooks de dados | 5 (`useLeadSources`, `useTeamMembers`, `useLeadTasks`, `useWhatsAppStatus`, `useRoles`) |
| campos de formulario em `useState` | 9 (`name`, `email`, `companyName`, `instagramHandle`, `linkedinUrl`, `sourceId`, `assignedTo`, `tags`, `dirty`) |
| auto-save de observacoes com timer e refs | 1 (`obsTimerRef`, `pendingObsRef`, `:81` a `:84`) |
| modal filho montado | 1 (`CreateTaskModal`) |

**Consequencias, em ordem de gravidade:**

1. **Risco de corrida de escrita.** Sao dois timers de auto-save de observacoes independentes, sobre o **mesmo lead**, com dois buffers de texto separados. `handleClose` (`:212`) chama `flushFields()` e `flushObservations()`. Duas instancias podem gravar valores divergentes no mesmo campo.
2. **Estado de formulario divergente.** Editar o nome numa instancia nao reflete na outra. Qual das duas vence depende de qual salvou por ultimo.
3. Dois `CreateTaskModal` montados, duas assinaturas de cada query (o React Query dedupa a requisicao pelo cache, entao **nao** sao 2 chamadas de rede, mas sao 2 subscriptions e 2 arvores).

Isso e **pre-existente e nao e uma regressao das fases anteriores**, mas esta exatamente no bloco de JSX que esta fase precisa reescrever, e a correcao e o caminho mais curto e nao um desvio: **renderizar uma unica instancia e mudar apenas o container por breakpoint.**

#### 4.1.2 O de/para

```
DE (:15 a :17):
  const InboxPage = () => {
    const [searchParams] = useSearchParams()
    const { selectedLeadId, setSelectedLeadId, contactPanelOpen, setContactPanelOpen } = useInboxStore()

PARA:
  const InboxPage = () => {
    const { leadId } = useParams<{ leadId: string }>()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { contactPanelOpen, setContactPanelOpen } = useInboxStore()
    const panelIsInline = useIsPanelInline()
    const selectedLeadId = leadId ?? null
```

```
DE (:21 a :26) - o useEffect que le o query param:
  useEffect(() => {
    const leadParam = searchParams.get('lead')
    if (leadParam) setSelectedLeadId(leadParam)
  }, [searchParams, setSelectedLeadId])

PARA - o mesmo useEffect, agora redirecionando para a rota canonica:
  useEffect(() => {
    const leadParam = searchParams.get('lead')
    if (leadParam) navigate(`/inbox/${leadParam}`, { replace: true })
  }, [searchParams, navigate])
```

O `replace: true` **nao e opcional**: sem ele, a URL com query param fica no historico e o botao voltar quica entre `/inbox?lead=X` e `/inbox/X`, que e justamente o gesto que a Decisao 2 existe para consertar. Este bloco e o que preserva os 4 links de entrada da secao 8.1.

```
DE (:48 a :58) - o layout:
  <div className="flex h-full relative">
    <div className="w-[340px] min-w-[300px] shrink-0">
      <ConversationList />
    </div>
    <div className="flex-1 min-w-0">
      {selectedLead ? <ChatWindow lead={selectedLead} /> : <EmptyInbox />}
    </div>

PARA:
  <div className="flex h-full relative">
    <div className={cn(
      'w-full shrink-0 lg:w-[340px] lg:min-w-[300px]',
      selectedLeadId && 'hidden lg:block',
    )}>
      <ConversationList />
    </div>
    <div className={cn(
      'flex-1 min-w-0',
      !selectedLeadId && 'hidden lg:block',
    )}>
      {selectedLead ? <ChatWindow lead={selectedLead} /> : <EmptyInbox />}
    </div>
```

A tabela do de/para por breakpoint:

| Viewport | Sem conversa selecionada | Com conversa selecionada |
|---|---|---|
| < `lg` | lista **100%** (360px), chat oculto | lista oculta, chat **100%** (360px) |
| >= `lg` | lista 340px + `EmptyInbox` | lista 340px + chat (idem hoje) |

Em `lg` e acima o resultado e identico ao de hoje: `lg:w-[340px] lg:min-w-[300px]` reproduz o `w-[340px] min-w-[300px]`, e as duas condicoes de ocultacao sao neutralizadas por `lg:block`.

**Por que `hidden`/`block` e nao montagem condicional.** Manter os dois montados preserva a arvore da `ConversationList`, o cache das queries e o estado dos filtros ao entrar e sair de uma conversa. Desmontar a lista a cada abertura de conversa faria a lista recarregar visualmente a cada volta, que e uma regressao de percepcao no aparelho mais lento. O custo e manter a arvore da lista viva, que ja e o custo de hoje no desktop.

**Correcao E2: a posicao de scroll NAO sobrevive, e nenhuma das duas alternativas a preserva.** A versao original desta secao afirmava que `hidden` preservava o scroll. Esta errado: `display:none` destroi a caixa de rolagem, e o navegador zera o `scrollTop` do scroller (`conversation-list.tsx:101`, `flex-1 overflow-y-auto`). Ao reexibir, a lista volta ao topo.

Isso **nao muda a decisao**, porque desmontar perderia o scroll do mesmo jeito, e ainda por cima a arvore e o estado. `hidden`/`block` continua sendo a escolha certa, com uma vantagem a menos do que a Spec dizia. O que muda e o criterio 19, reescrito em 10.2: **so os filtros sao verificaveis**. Preservar o scroll exigiria guardar o `scrollTop` e restaurar, que e escopo novo e nao entra nesta fase.

```
DE (:61 a :82) - o painel, com as duas instancias:
  {showPanel && (
    <>
      <div className="absolute inset-0 z-30 bg-black/20 xl:hidden" onClick={() => setContactPanelOpen(false)} />
      <div className={cn('h-full shrink-0 z-40', 'hidden xl:block xl:relative xl:w-[360px]')}>
        <ContactPanel lead={selectedLead} />
      </div>
      <div className="absolute right-0 top-0 bottom-0 z-40 w-[340px] max-w-[85vw] xl:hidden">
        <ContactPanel lead={selectedLead} />
      </div>
    </>
  )}

PARA - uma unica instancia, container alternado:
  {showPanel && (
    <>
      {!panelIsInline && (
        <div
          className="absolute inset-0 z-30 bg-black/20"
          onClick={() => setContactPanelOpen(false)}
        />
      )}
      <div className={cn(
        'z-40',
        panelIsInline
          ? 'h-full shrink-0 relative w-[360px]'
          : 'absolute right-0 top-0 bottom-0 w-[340px] max-w-[85vw]',
      )}>
        <ContactPanel lead={selectedLead} />
      </div>
    </>
  )}
```

A alternancia deixa de ser por classe (`xl:hidden` / `hidden xl:block`) e passa a ser por valor de `panelIsInline`, o hook reativo da secao 5. **Essa troca e o que torna possivel montar uma instancia so**, porque com uma unica arvore o container precisa ser decidido em JavaScript e nao em CSS.

O `showPanel` de `:45` (`contactPanelOpen && !!selectedLead`) muda para usar o valor efetivo do painel, definido em 5.2.

**Nao muda no desktop:** em `xl` e acima, `panelIsInline` e verdadeiro, o backdrop nao renderiza (hoje ele ja e `xl:hidden`) e o container e `relative w-[360px]` (hoje `xl:relative xl:w-[360px]`). Equivalente, com uma instancia a menos.

### 4.2 `src/App.tsx` - a rota filha

```
:90  DE:    <Route path="/inbox" element={<InboxPage />} />

     PARA:  <Route path="/inbox" element={<InboxPage />} />
            <Route path="/inbox/:leadId" element={<InboxPage />} />
```

**Duas rotas explicitas para o mesmo elemento**, e nao um segmento opcional (`/inbox/:leadId?`). Motivo: o segmento opcional so existe a partir do React Router 6.5 e a semantica varia entre versoes menores; duas linhas explicitas nao dependem disso e o `InboxPage` ja e a mesma referencia `lazy()`, entao nao ha chunk duplicado nem remontagem ao navegar entre as duas.

**Esta e a unica alteracao permitida em `App.tsx` nesta fase.** Nada de reordenar, agrupar ou mexer em outra rota.

### 4.3 `src/components/inbox/conversation-list.tsx` - navegar em vez de setar estado

```
:17  DE:    const { selectedLeadId, setSelectedLeadId, filters, setFilters } = useInboxStore()
     PARA:  const { filters, setFilters } = useInboxStore()
            const { leadId: selectedLeadId } = useParams<{ leadId: string }>()
            const navigate = useNavigate()

:116 DE:    onClick={() => setSelectedLeadId(lead.id)}
     PARA:  onClick={() => navigate(`/inbox/${lead.id}`, { state: { fromList: true } })}
```

Mais o import de `useParams` e `useNavigate` de `react-router-dom`.

`:115` (`isSelected={lead.id === selectedLeadId}`) **nao muda**: o nome da variavel foi preservado no destructuring justamente para isso, e o comportamento e identico.

**Sem `replace`** neste caso, ao contrario de 4.1.2: cada conversa aberta pela lista **deve** empilhar no historico, para o voltar do Android retornar a lista. E o proposito da Decisao 2.

**Correcao E1, o `state: { fromList: true }`.** Ele marca que esta conversa foi aberta a partir da lista, e portanto que existe uma entrada de historico interna para a qual voltar. O botao voltar da tela (4.4) le essa marca para decidir entre voltar de verdade e redirecionar. `state` e API publica do React Router (versao 7.14.1 nesta base) e sobrevive a refresh, ao contrario de uma variavel em memoria. Nao usar `window.history.state.idx`, que resolveria o mesmo problema mas depende de detalhe interno do router.

### 4.4 `src/components/inbox/chat-header.tsx` - o botao voltar

```
:29  DE:    <div className="flex items-center gap-3 border-b px-4 py-3">
     PARA:  <div className="flex items-center gap-2 border-b px-3 py-3 lg:gap-3 lg:px-4">

Inserir como PRIMEIRO filho, antes do <Avatar> de :30:
     <button
       onClick={() =>
         location.state?.fromList
           ? navigate(-1)
           : navigate('/inbox', { replace: true })
       }
       className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-smooth hover:bg-accent lg:hidden"
       aria-label="Voltar para conversas"
     >
       <ChevronLeft className="h-5 w-5" />
     </button>
```

Mais o import de `ChevronLeft` no bloco de `lucide-react` da linha 5, e de `useLocation` no import de `react-router-dom` da linha 1, com `const location = useLocation()` junto dos outros hooks.

#### Correcao E1: por que nao `navigate('/inbox')` puro

A versao original desta secao mandava `navigate('/inbox')`, que **empurra** uma entrada nova. O resultado media assim:

```
[/inbox]  ->  toca conversa  ->  [/inbox, /inbox/A]  ->  toca voltar  ->  [/inbox, /inbox/A, /inbox]
```

O voltar do **sistema** cai no indice 1 e **reabre a conversa**. E o mesmo quicar que 4.1.2 se deu ao trabalho de evitar no `?lead=`, so que no botao da tela, e ataca a Decisao 2 na raiz. Pior, cada ciclo abrir/voltar empilha 2 entradas: depois de tres conversas sao 6 toques no voltar para sair do inbox, ricocheteando por conversas ja vistas.

Tres correcoes foram medidas. A tabela e o historico depois de **tres** ciclos abrir/voltar:

| Alternativa | Historico resultante | Toques para sair | Veredito |
|---|---|---|---|
| `navigate('/inbox')` (original) | `[/inbox, /inbox/A, /inbox, /inbox/B, /inbox, /inbox/C, /inbox]` | 6, reabrindo conversas | **defeituoso** |
| `navigate('/inbox', { replace: true })` | `[/inbox, /inbox, /inbox, /inbox]` | 4, por telas identicas | mata o quicar, deixa entrada morta que acumula |
| **`state` + `navigate(-1)`** (adotado) | `[/inbox, /inbox/C]` | **1** | comportamento nativo |

O `navigate(-1)` sozinho **nao serve**: nos criterios 12 e 13 (refresh e URL compartilhada) nao ha entrada anterior no historico, e o voltar sairia do site. Dai o par com o `state` de 4.3, que distingue os dois casos: veio da lista, volta de verdade; chegou por link direto, redireciona com `replace`.

**O botao so existe abaixo de `lg`** (`lg:hidden`), entao nada disso afeta o desktop.

**`h-11 w-11` (44px) e nao `size="icon"` do Button.** E o mesmo padrao e o mesmo comentario que o `mobile-topbar.tsx:14` da Fase 1 ja estabeleceu: o `size="icon"` do `Button` da 36px e viola o criterio 13 do PRD (alvo minimo de 44x44 no mobile). Seguir o padrao ja existente em vez de inventar um segundo.

**O ajuste de `gap-3 px-4` para `gap-2 px-3` abaixo de `lg` e necessario, nao cosmetico.** Medida do header do chat em 360px com o botao novo:

| Elemento | Largura |
|---|---|
| botao voltar | 44px |
| `gap` | 8px |
| avatar `h-9 w-9` | 36px |
| `gap` | 8px |
| bloco de identidade `flex-1 min-w-0 truncate` | elastico |
| `gap` | 8px |
| badge de score (condicional, `text-[10px] px-1.5`) | 62px |
| botao do painel `h-8 w-8` | 32px |
| botao do pipeline `h-8 w-8` | 32px |
| `px-3` do container | 24px |
| **fixos** | **254px** |

**254px de fixos em 360px deixam 106px para o nome e o telefone**, que sao `truncate` e portanto cedem sem estourar. Com o `gap-3 px-4` de hoje os fixos subiriam para 264px, e a folga cairia para 96px. Os 10px nao decidem entre quebrar e nao quebrar (nenhum dos dois estoura), mas em `text-sm` compram cerca de 1,4 caractere a mais de nome visivel, que numa linha de 14 caracteres e ganho real. Em `lg` e acima o espacamento de hoje volta integralmente.

**O botao do painel (`:61` a `:69`) nao muda.** Ele ja atende a Decisao 1 e ja aparece no mobile.

### 4.5 `src/stores/inbox.store.ts` - remover o lead, corrigir o painel

```
:12  REMOVER:  selectedLeadId: string | null
:16  REMOVER:  setSelectedLeadId: (id: string | null) => void
:24  REMOVER:  selectedLeadId: null,
:33  REMOVER:  setSelectedLeadId: (id) => set({ selectedLeadId: id }),
```

Justificado em 3.4: a URL passa a ser a fonte da verdade e duas fontes seriam pior que uma migracao.

```
:15  DE:    contactPanelOpen: boolean
     PARA:  contactPanelOpen: boolean | null

:32  DE:    contactPanelOpen: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches,
     PARA:  contactPanelOpen: null,

:20  DE:    setContactPanelOpen: (open: boolean) => void
     PARA:  setContactPanelOpen: (open: boolean | null) => void

:19  DE:    toggleContactPanel: () => void
     PARA:  toggleContactPanel: (currentEffective: boolean) => void

:36  DE:    toggleContactPanel: () => set((s) => ({ contactPanelOpen: !s.contactPanelOpen })),
     PARA:  toggleContactPanel: (currentEffective) => set({ contactPanelOpen: !currentEffective }),
```

O racional completo esta na secao 5.

### 4.6 `src/components/inbox/contact-panel.tsx` - so a chamada do toggle

```
:73  DE:    const toggleContactPanel = useInboxStore((s) => s.toggleContactPanel)
     PARA:  const setContactPanelOpen = useInboxStore((s) => s.setContactPanelOpen)

:215 DE:    toggleContactPanel()
     PARA:  setContactPanelOpen(false)
```

`handleClose` (`:212`) sempre **fecha**, nunca alterna: ele e o `X` do cabecalho do painel. Usar `setContactPanelOpen(false)` e mais correto que `toggleContactPanel()` mesmo antes desta fase, e evita ter que descobrir o valor efetivo aqui dentro so para inverte-lo. As duas linhas de `flushFields()` e `flushObservations()` acima **nao mudam**.

**Nenhuma outra linha deste arquivo e tocada.** Ele tem 19,7 KB e as pendencias herdadas (campos Instagram e LinkedIn em 2 colunas, secao 9) **nao sao resolvidas aqui**.

### 4.7 `src/hooks/use-panel-inline.ts` - arquivo novo

```ts
import { useSyncExternalStore } from 'react'

// Corte alinhado ao breakpoint xl do Tailwind (min-width: 1280px), que e onde
// o painel de contato deixa de ser overlay e vira terceira coluna inline.
// Nao usa o use-mobile.ts porque aquele corta em lg (1024px): a secao 2.3 da
// Spec mede que em 1024px sobrariam 68px para o chat com o painel inline.
const PANEL_INLINE_QUERY = '(min-width: 1280px)'

const isSupported = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'

const subscribe = (onStoreChange: () => void) => {
  if (!isSupported()) return () => {}
  const mql = window.matchMedia(PANEL_INLINE_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

const getSnapshot = () => (isSupported() ? window.matchMedia(PANEL_INLINE_QUERY).matches : false)

const getServerSnapshot = () => false

/**
 * true quando a viewport comporta o painel de contato como coluna inline.
 *
 * Mesma tecnica do use-mobile.ts da Fase 1: useSyncExternalStore em vez de
 * useState + useEffect, para nao perder uma mudanca de viewport ocorrida entre
 * o render e a assinatura.
 */
export const useIsPanelInline = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
```

**Por que um arquivo novo e nao uma mudanca no `use-mobile.ts`:** aquele arquivo e do shell da Fase 1 e esta na lista de nao tocar, e responde 1024px, que a secao 2.3 mede como inviavel para o painel. Um hook por arquivo tambem e a convencao do `CLAUDE.md`.

### 4.8 `src/stores/inbox.store.test.ts` - ajustar aos novos tipos

O teste existente tem 3 casos e **dois deles quebram** com as mudancas de 4.5.

```
:6   DE:    useInboxStore.setState({ contactPanelOpen: false, selectedLeadId: null })
     PARA:  useInboxStore.setState({ contactPanelOpen: null })
```

```
:9 a :14  O caso "contactPanelOpen default depende do viewport" perde o objeto:
          o default deixa de depender do viewport e passa a ser null.
          SUBSTITUIR por um caso que afirme o novo contrato:

  it('contactPanelOpen inicia como null (segue o viewport)', () => {
    useInboxStore.setState({ contactPanelOpen: null })
    expect(useInboxStore.getState().contactPanelOpen).toBeNull()
  })
```

```
:16 a :22  toggleContactPanel agora recebe o valor efetivo:

  it('toggleContactPanel inverte o valor efetivo recebido', () => {
    const { toggleContactPanel } = useInboxStore.getState()
    toggleContactPanel(false)
    expect(useInboxStore.getState().contactPanelOpen).toBe(true)
    toggleContactPanel(true)
    expect(useInboxStore.getState().contactPanelOpen).toBe(false)
  })
```

O terceiro caso (`setContactPanelOpen define valor explicitamente`, `:24` a `:30`) **continua valido sem alteracao**.

O comentario de `:11` a `:13` ("No jsdom, window.innerWidth = 1024 por default, entao < 1280 = false") deixa de ser verdadeiro e sai junto com o caso.

---

## 5. O fix do `inbox.store.ts:32`

Adiado explicitamente da Fase 1 para o ciclo do inbox, e registrado como pendencia nas Specs das Fases 3 e 4.

### 5.1 O defeito, e por que ele e maior do que parece

```ts
:32  contactPanelOpen: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches,
```

Isso e avaliado **uma unica vez, na criacao do modulo do store**, antes de qualquer render. Nao ha listener. Consequencias medidas:

1. **Girar o aparelho nao atualiza.** Um tablet de 1280x800 cruza o breakpoint ao girar: em paisagem o painel deveria vir inline e aberto, em retrato deveria virar overlay fechado. Hoje o valor congela no que era na hora do carregamento.
2. **Redimensionar a janela no desktop nao atualiza.** Mesmo efeito, e o criterio 8 do PRD cobra exatamente isso para a sidebar.
3. **O valor e lido na importacao do modulo, nao na montagem da pagina.** Como `InboxPage` e `lazy()` (`App.tsx:18`), o modulo do store pode ser avaliado em um momento diferente daquele em que o inbox aparece na tela.

**Onde `contactPanelOpen` e lido:** `inbox.tsx:45` (compoe `showPanel`) e `chat-header.tsx:68` (colore o icone do botao). Dois pontos, ambos tratados abaixo.

### 5.2 A correcao: tres estados em vez de dois

A dificuldade real nao e por um listener no store. E que **o valor precisa significar duas coisas ao mesmo tempo**: um padrao que depende do viewport, e uma escolha explicita do usuario que deve sobreviver a mudancas de viewport. Um `boolean` nao comporta as duas.

Se eu simplesmente tornasse o valor reativo ao viewport, criaria um bug pior que o atual: o usuario fecha o painel no desktop, redimensiona a janela, e o painel **reabre sozinho**, descartando a escolha dele.

Por isso `contactPanelOpen: boolean | null`:

| Valor | Significado |
|---|---|
| `null` | o usuario ainda nao opinou; siga o padrao do viewport |
| `true` | o usuario abriu explicitamente |
| `false` | o usuario fechou explicitamente |

O valor efetivo e derivado em `inbox.tsx`:

```tsx
const panelIsInline = useIsPanelInline()
const panelOpen = contactPanelOpen ?? panelIsInline
const showPanel = panelOpen && !!selectedLead
```

E em `chat-header.tsx`, para o estado visual do icone (`:68`):

```
:20  DE:    const { contactPanelOpen, toggleContactPanel } = useInboxStore()
     PARA:  const { contactPanelOpen, toggleContactPanel } = useInboxStore()
            const panelIsInline = useIsPanelInline()
            const panelOpen = contactPanelOpen ?? panelIsInline

:65  DE:    onClick={toggleContactPanel}
     PARA:  onClick={() => toggleContactPanel(panelOpen)}

:68  DE:    <PanelRight className={cn('h-4 w-4', contactPanelOpen && 'text-primary')} />
     PARA:  <PanelRight className={cn('h-4 w-4', panelOpen && 'text-primary')} />
```

Com isso:

| Situacao | Comportamento |
|---|---|
| Abre o inbox em 1440px, sem tocar no botao | painel inline aberto (`null` segue o viewport) |
| Abre o inbox em 360px, sem tocar no botao | painel fechado (`null` segue o viewport) |
| Fecha o painel no desktop e redimensiona a janela | **continua fechado** (`false` explicito vence) |
| Gira o tablet cruzando 1280px, sem ter opinado | acompanha o viewport, **que e o bug de hoje** |

**O `chat-header.tsx` passa a importar o hook novo.** E o unico acrescimo de import naquele arquivo alem do `ChevronLeft` de 4.4.

---

## 6. Verificacao do layout final, por viewport

Medida do resultado esperado, para a verificacao manual ter numero contra o qual comparar:

| Viewport | Lista | Chat | Painel |
|---|---|---|---|
| 360px, sem conversa | **360px** (100%) | oculto | n/a |
| 360px, com conversa | oculto | **360px** (100%) | overlay `w-[340px] max-w-[85vw]` = **306px**, sob toque do botao |
| 768px, com conversa | oculto | 768px | overlay 340px |
| 1024px (`main` 768) | 340px | 428px | overlay 340px |
| 1280px (`main` 1024) | 340px | **324px** | inline 360px |
| 1440px (`main` 1184) | 340px | 484px | inline 360px |

A linha de 1280px e a mais apertada do desktop e **e identica a de hoje**, nao e introduzida por esta fase.

---

## 7. Arquivos afetados

**7 arquivos de codigo, 1 novo, 1 de teste, mais esta Spec.**

| # | Arquivo | Linhas | Item | Tipo |
|---|---|---|---|---|
| 1 | `src/hooks/use-panel-inline.ts` | novo | 4.7 | **arquivo novo** |
| 2 | `src/stores/inbox.store.ts` | `:12`, `:15`, `:16`, `:19`, `:20`, `:24`, `:32`, `:33`, `:36` | 4.5, 5 | tipos e estado |
| 3 | `src/App.tsx` | `:90` | 4.2 | **1 linha acrescentada** |
| 4 | `src/pages/inbox.tsx` | `:15` a `:26`, `:45`, `:48` a `:82` | 4.1 | **estrutural** |
| 5 | `src/components/inbox/conversation-list.tsx` | `:17`, `:116` + imports | 4.3 | navegacao |
| 6 | `src/components/inbox/chat-header.tsx` | `:20`, `:29`, `:30` (insercao), `:65`, `:68` + imports | 4.4, 5.2 | botao voltar |
| 7 | `src/components/inbox/contact-panel.tsx` | `:73`, `:215` | 4.6 | 2 linhas |
| 8 | `src/stores/inbox.store.test.ts` | `:6`, `:9` a `:22` | 4.8 | teste |
| 9 | `docs/SPEC-responsividade-fase5-inbox.md` | novo | esta Spec | doc |

**Ordem sugerida:** 1 (o hook, que os outros importam), 2 (o store), 3 (a rota), 4 (a pagina), 5, 6, 7, 8. Rodar `npm run build` depois do 4 e ao final, e `npx vitest run src/stores/inbox.store.test.ts` depois do 8.

**Nenhuma linha de logica de mensagens, realtime ou envio e tocada.** `chat-window.tsx`, `message-list.tsx`, `message-bubble.tsx`, `chat-input.tsx`, `audio-recorder.tsx`, `use-messages.ts` e `use-conversation-list.ts` **nao aparecem nesta lista e nao devem ser abertos para edicao**.

---

## 8. Pontos onde a medicao encosta nas decisoes, sinalizados

O pedido determinou sinalizar qualquer ponto em que a medicao contrarie as duas decisoes de UX. **Nenhuma das duas foi contrariada.** Mas ha uma colisao de escopo e dois riscos que precisam de ciencia antes da implementacao.

### 8.1 COLISAO DE ESCOPO: 4 arquivos linkam para `/inbox?lead=<id>`, um deles em area proibida

| Arquivo | Linha | Area |
|---|---|---|
| `src/components/pipeline/deal-card.tsx` | `:241` | **PROIBIDA** (o `/pipeline` e branch separada) |
| `src/components/shared/notification-center.tsx` | `:80` | fora do inbox |
| `src/pages/contatos.tsx` | `:233` | fora do inbox |
| `src/pages/deals.tsx` | `:487` | fora do inbox |

Se a rota mudasse para `/inbox/:leadId` **sem compatibilidade**, os quatro quebrariam, e consertar o primeiro exigiria abrir `src/components/pipeline/`, que esta fora do escopo desta branch por decisao explicita.

**Resolvido sem tocar em nenhum dos quatro.** O `useEffect` de 4.1.2 mantem `/inbox?lead=<id>` funcionando, redirecionando para `/inbox/<id>` com `replace: true`. Os 4 call sites continuam corretos, o link antigo continua valido para qualquer URL ja compartilhada, e o `/pipeline` fica intocado.

**Consequencia deliberada:** ficam duas formas de chegar na mesma conversa. A antiga vira um alias que redireciona. **Nao proponho migrar os 4 call sites nesta fase**, porque um deles esta em area proibida e migrar so tres deixaria a base menos coerente que deixar os quatro iguais. Registro na secao 9 como pendencia para a branch do `/pipeline`, que podera migrar os quatro de uma vez.

### 8.2 O botao voltar do Android depende de o `MainLayout` nao interferir. Nao foi possivel verificar sem aparelho

O racional da Decisao 2 e que `/inbox/:leadId` faz o voltar do sistema retornar a `/inbox` de graca, via historico do navegador. Isso e verdadeiro para o React Router com `BrowserRouter`, e a mudanca de 4.3 (navegacao **sem** `replace`) e o que empilha a entrada.

O que **nao** consigo afirmar por medicao estatica: se o gesto de voltar do Android em um WebView ou PWA instalado se comporta igual ao do Chrome mobile. Nao ha PWA neste produto hoje (o PRD coloca PWA fora de escopo na secao 5), entao o alvo e o Chrome mobile, onde o comportamento e o esperado. **Registro como item de verificacao manual obrigatoria** (secao 10.2, item 8) e nao como risco de desenho.

### 8.3 O `EmptyInbox` deixa de aparecer no mobile, e isso e correto

Em `< lg` sem conversa selecionada, a lista ocupa 100% e o container do chat fica `hidden`. O `EmptyInbox` ("Selecione uma conversa para comecar") nunca renderiza visivelmente no mobile.

**E o comportamento certo e nao uma perda:** aquela mensagem existe para preencher a segunda coluna de um layout de duas colunas. No master-detail de coluna unica nao ha segunda coluna, e a lista de conversas ja e a instrucao. **Nenhuma alteracao em `empty-inbox.tsx`**, que continua servindo o desktop.

---

## 9. Fora do escopo desta fase (nao tocar)

**O `/pipeline` inteiro.** `src/pages/pipeline.tsx`, `src/components/pipeline/pipeline-board.tsx` e **todo o resto de `src/components/pipeline/`**, incluindo `deal-card.tsx:241` da secao 8.1. E branch separada.

Atencao a duas armadilhas de caminho:
- `contact-panel.tsx` importa `LeadTagsInput` de `@/components/pipeline/lead-tags-input` (`:15`). **O import permanece, o arquivo importado nao e tocado.**
- O `/pipeline` tem o proprio `selectedLeadId` em `usePipelineStore` e o proprio `setSelectedLeadId` em `pipeline-board.tsx:218`. **Sao outro estado, com o mesmo nome. Nao mexer neles ao mexer no do inbox.**

**Shell da Fase 1:** `main-layout.tsx`, `app-sidebar.tsx`, `mobile-topbar.tsx`, `sheet.tsx`, `use-mobile.ts`. O `use-mobile.ts` nao e nem importado nesta fase (o hook novo de 4.7 e outro arquivo).

**Globais da Fase 2:** `dialog.tsx`, o padding das rotas, os grids.

**Logica de negocio do inbox**, que nao e responsividade: `chat-window.tsx`, `message-list.tsx`, `message-bubble.tsx`, `chat-input.tsx`, `audio-bubble.tsx`, `audio-recorder.tsx`, `typing-indicator.tsx`, `reply-templates-popover.tsx`, `conversation-item.tsx`, `lead-deals-panel.tsx`, `ad-context-card.tsx`, `empty-inbox.tsx`, `use-messages.ts`, `use-conversation-list.ts`. **Se algum deles parecer exigir mudanca, PARAR e reportar.**

**Sempre fora:** `src/styles/globals.css`, `supabase/`.

### Pendencias registradas

| # | Pendencia | Onde | Destino |
|---|---|---|---|
| 1 | Os 4 call sites de `/inbox?lead=` continuam na forma antiga, servidos por redirect | secao 8.1 | branch do `/pipeline`, que pode migrar os quatro de uma vez |
| 2 | Campos Instagram e LinkedIn em 2 colunas no painel de 340px | `contact-panel.tsx:320` | passada futura no painel |
| 3 | `TabsList` de 3 abas estoura cerca de 9px em 390px | `edit-lead-modal.tsx:215` | branch do `/pipeline` |
| 4 | Rotulo de variacao do `MiniChart` sobrepoe no desktop entre 1024 e ~1400px | `monthly-comparison-grid.tsx:109` | herdada da Fase 4 |
| 5 | `MonthlyComparisonChart` e codigo morto | `monthly-comparison-chart.tsx` | limpeza |
| 6 | `alert-dialog.tsx` tem o mesmo problema de `max-h` que o `dialog.tsx` teve | `src/components/ui/alert-dialog.tsx` | avaliar |
| 7 | Breakdown dos KPI cards aperta entre 640px e 1024px | `deals.tsx:293`, `:337` | herdada da Fase 3 |
| 8 | **E3.** Com `/inbox/<id-invalido>` no mobile, a lista fica `hidden` (porque `selectedLeadId` e truthy) mas o `selectedLead` resolve para `null`, entao renderiza o `EmptyInbox`, que **nao tem `ChatHeader` e portanto nao tem botao voltar**. O usuario fica sem lista e sem saida na tela, so com o voltar do sistema. Ficou mais alcancavel justamente porque a URL agora e compartilhavel e sobrevive a delecao do lead | `inbox.tsx:70` a `:78` | passada futura no inbox |
| 9 | **E2.** A posicao de scroll da lista volta ao topo ao sair e voltar de uma conversa, porque `display:none` zera o `scrollTop`. Preservar exigiria guardar e restaurar o `scrollTop` | `conversation-list.tsx:101` | passada futura no inbox |
| 10 | O `location.state` e tipado como `any` pelo proprio react-router, entao `location.state?.fromList` e um acesso destipado na origem. **Nenhum `any` novo foi introduzido e o `CLAUDE.md` nao esta violado**, mas um typo no produtor (`fromLista`) compilaria, passaria no lint e cairia silenciosamente no ramo do `replace`. A falha e degradacao graciosa, nao quebra: vira o comportamento da alternativa 2 de 4.4. Blindar exige um tipo compartilhado entre produtor e consumidor (`satisfies`), que e arquivo novo e nao cabe no escopo desta fase | `conversation-list.tsx:119`, `chat-header.tsx:34` | passada futura no inbox |

---

## 10. Verificacao

### 10.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida. **Este e o mais sensivel desta fase:** remover `selectedLeadId` do store faz o TypeScript apontar qualquer consumidor esquecido |
| 2 | `npx vitest run src/stores/inbox.store.test.ts` | 3 casos passando com os novos contratos de 4.8 |
| 3 | `npm run build` | sem erro |
| 4 | `npm run lint` | baseline no **merge-base**, nunca com `git stash`. `git merge-base HEAD develop` (deve dar `1b167d5`), checkout detached, `npm run lint`, anotar, voltar. Reportar "X no baseline, Y na branch, Z novos" |
| 5 | `git status` | nada em `supabase/`, `src/styles/`, `src/components/pipeline/`, nos 5 arquivos do shell, em `dialog.tsx`, nem nos arquivos de logica listados na secao 9 |
| 6 | `git ls-files docs/SPEC-responsividade-fase5-inbox.md` | tem que retornar o caminho |
| 7 | `git diff --stat develop` | no maximo 9 arquivos, exatamente os da secao 7 |

### 10.2 Manual, em 360px e 390px

| # | Verificacao | Origem |
|---|---|---|
| 8 | **O botao voltar do sistema.** Abrir `/inbox`, tocar numa conversa, e usar o **voltar do Android** (nao o botao da tela). Tem que voltar para a lista, e nao sair do inbox. **E o racional inteiro da Decisao 2 e o unico item que exige aparelho real** | Decisao 2 |
| 8a | **O gesto combinado, que e onde o defeito E1 aparecia.** Abrir uma conversa, voltar pelo **botao da tela**, e so entao usar o **voltar do sistema**. NAO pode reabrir a conversa: tem que sair do inbox | E1, 4.4 |
| 8b | **Sem acumulo.** Abrir e voltar de tres conversas diferentes, sempre pelo botao da tela. Depois, **um unico** toque no voltar do sistema tem que sair do inbox. Se exigir varios toques passando por telas iguais, o `state` de 4.3 nao esta chegando no botao | E1, 4.4 |
| 8c | **Link direto nao pode sair do site.** Abrir `/inbox/<id>` numa aba nova (sem historico anterior) e tocar no botao voltar **da tela**: tem que ir para a lista, e nao fechar a aba. E o caso que o `navigate(-1)` puro quebraria | E1, criterios 12 e 13 |
| 9 | Lista ocupa 100% da largura, sem a faixa de 20px de chat ao lado | criterio 15 |
| 10 | Tocar numa conversa: a lista some, o chat ocupa 100%, a URL vira `/inbox/<id>` | criterio 15 |
| 11 | O botao voltar da tela (`ChevronLeft` no header) retorna a lista, e tem area de toque confortavel (44x44) | criterios 13 e 15 |
| 12 | Dar refresh (F5) em `/inbox/<id>`: a conversa continua aberta | Decisao 2 |
| 13 | Copiar a URL da conversa e abrir em outra aba: cai na mesma conversa | Decisao 2 |
| 14 | **Compatibilidade:** abrir `/inbox?lead=<id>` na barra de enderecos. Tem que redirecionar para `/inbox/<id>` e **o voltar nao pode quicar** entre as duas URLs | secao 8.1 |
| 15 | Os 4 links de entrada continuam funcionando: notificacao (sino), `/contatos` e `/deals`. **O do `/pipeline` (`deal-card`) tambem, e ele nao foi tocado** | secao 8.1 |
| 16 | Com a conversa aberta, tocar no botao `PanelRight` do header: o painel abre como overlay pela direita, com backdrop | Decisao 1 |
| 17 | Tocar no backdrop e no `X` do painel: fecha nos dois casos | Decisao 1 |
| 18 | Voltar para a lista com o painel aberto e reabrir a conversa: sem estado preso nem painel fantasma | 4.1 |
| 19 | Ao voltar para a lista, os **filtros e a busca** continuam onde estavam. **A posicao de scroll NAO: ela volta ao topo, e isso e esperado**, nao e bug. Ver a correcao E2 em 4.1.2 antes de investigar | 4.1.2, E2 |

### 10.3 Nao regressao em desktop

| # | Verificacao | Viewport |
|---|---|---|
| 20 | Tres colunas lado a lado, lista 340px, painel inline 360px, exatamente como hoje | 1440px |
| 21 | Clicar numa conversa **nao** esconde a lista | 1440px |
| 22 | O painel inline abre e fecha pelo botao do header, como hoje | 1440px |
| 23 | Duas colunas, painel em overlay ao tocar no botao (nao inline) | 1024px a 1279px |
| 24 | **Fechar o painel e redimensionar a janela: ele continua fechado.** E o caso que distingue a correcao certa da errada em 5.2 | 1440px, arrastando |
| 25 | Redimensionar de 1440px para 800px e voltar: layout consistente, sem estado preso | criterio 8 |
| 26 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie | 1440px |

O item 24 e o mais importante da secao: se o painel reabrir sozinho ao redimensionar, a correcao do `inbox.store.ts:32` trocou um bug por outro pior.
