# Spec - Responsividade Mobile, Fase 2 (ajuste global de conteudo)

**Branch:** `feature/responsividade-mobile-conteudo`
**Base:** `develop` (Fase 1 ja mergeada em `b785721`)
**Escopo:** frontend puro. Sem migration, sem schema, sem Edge Function.
**PRD de origem:** `docs/PRD-responsividade.md`, secao 4, Fase 2 (itens 6, 7 e 8).

Esta fase entrega exatamente tres correcoes globais:

- **A.** `dialog.tsx`: uma correcao que resolve os 20 modais do produto.
- **B.** padding de pagina `p-4 sm:p-6` nas rotas autenticadas.
- **C.** `grid-cols-N` sem prefixo de breakpoint.

---

## 0. Nota de procedimento

O `docs/PRD-responsividade.md` e o `docs/SPEC-responsividade-fase1.md` nunca chegaram a ser commitados na Fase 1 (o codigo foi mergeado, os documentos ficaram como untracked e se perderam). Recuperei os dois do transcript da sessao e os reintroduzi em `docs/` neste branch. O conteudo e byte a byte o que foi aprovado; nada foi reescrito.

Todos os numeros de linha desta Spec foram medidos contra a `develop` atual (pos Fase 1), nao contra os do PRD.

---

## 1. Reverificacao contra o codigo atual

### 1.1 `grid-cols-N` sem prefixo de breakpoint

Comando usado:

```bash
grep -rnE "(^|[^:A-Za-z-])grid-cols-[234]([^0-9]|$)" src --include="*.tsx" --include="*.ts"
```

**16 ocorrencias**, contra as 14 estimadas na secao 1.6 do PRD.

| # | Arquivo:linha | Classe hoje | No PRD? |
|---|---|---|---|
| 1 | `src/components/gestao/goals-manager.tsx:327` | `grid grid-cols-2 gap-3` | sim |
| 2 | `src/components/gestao/goals-manager.tsx:363` | `grid grid-cols-2 gap-3` | sim |
| 3 | `src/components/shared/color-picker.tsx:28` | `grid grid-cols-4 gap-1.5` | sim |
| 4 | `src/components/pipeline/edit-lead-modal.tsx:215` | `grid w-full grid-cols-3` | **nao** |
| 5 | `src/components/pipeline/import-steps/result-step.tsx:48` | `grid grid-cols-3 gap-3` | **nao** |
| 6 | `src/components/tarefas/create-task-modal.tsx:270` | `grid grid-cols-4 gap-2` | sim |
| 7 | `src/components/tarefas/create-task-modal.tsx:357` | `grid gap-4 grid-cols-2` | sim |
| 8 | `src/components/tarefas/edit-task-modal.tsx:123` | `grid grid-cols-4 gap-2` | sim |
| 9 | `src/components/company/theme-customizer.tsx:187` | `grid grid-cols-3 gap-3` | sim |
| 10 | `src/components/dashboard/monthly-comparison-grid.tsx:151` | `grid grid-cols-2 lg:grid-cols-4 gap-3` | **nao** |
| 11 | `src/components/dashboard/monthly-comparison-grid.tsx:160` | `grid grid-cols-2 lg:grid-cols-4 gap-3` | **nao** |
| 12 | `src/components/inbox/contact-panel.tsx:320` | `grid grid-cols-2 gap-2` | sim |
| 13 | `src/pages/dashboard.tsx:128` | `grid grid-cols-3 gap-2` | sim |
| 14 | `src/pages/deals.tsx:268` | `grid grid-cols-3 gap-2` | sim |
| 15 | `src/pages/deals.tsx:293` | `grid grid-cols-3 gap-2` | sim |
| 16 | `src/pages/deals.tsx:337` | `grid grid-cols-3 gap-2` | sim |

**Divergencias em relacao a secao 1.6 do PRD:**

1. **Quatro ocorrencias a mais.** As #4, #5, #10 e #11 nao constavam da lista do PRD. As #10 e #11 sao falso positivo do ponto de vista do problema: ja sao `grid-cols-2 lg:grid-cols-4`, ou seja, ja nascem mobile-first. O grep as pega porque o `grid-cols-2` base nao tem prefixo, mas nao ha nada a corrigir.
2. **A #13 (`dashboard.tsx:128`) nao e uma grade de conteudo.** E o `KpiCardSkeleton`. O componente real que ele imita, `Breakdown` (`dashboard.tsx:80-83`), usa `flex flex-col gap-1.5`, ou seja, linhas empilhadas em **qualquer** viewport. O skeleton nunca correspondeu ao componente real, em nenhuma largura. Detalhe em 4.C, caso 13.
3. **A #14 (`deals.tsx:268`) tambem e skeleton**, espelhando as #15 e #16. Deve receber a mesma mudanca delas para nao divergir.

Contagem efetiva de itens que exigem decisao: **14** (16 menos as duas de `monthly-comparison-grid`). A conta do PRD estava certa por acaso, com composicao diferente.

### 1.2 `DialogContent` hoje

`src/components/ui/dialog.tsx:33-40`, transcrito na integra:

```tsx
<DialogPrimitive.Content
  ref={ref}
  className={cn(
    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
    className
  )}
  {...props}
>
```

Sem `max-h`, sem `overflow-y-auto`, `max-w-lg` sem prefixo.

**`cn` usa `tailwind-merge`.** Confirmado em `src/lib/utils.ts`:

```ts
export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs))
}
```

Isso importa porque `twMerge` desduplica por grupo **e por modificador**: `sm:max-w-lg` na base e `sm:max-w-md` no consumidor colidem e o consumidor vence, enquanto o `max-w-[calc(100vw-2rem)]` sem prefixo sobrevive intacto. E o que faz o padrao pedido funcionar.

**Auditoria dos 20 consumidores de `DialogContent`:** 18 passam `className`, 2 nao passam nada (`bulk-move-pipeline-modal.tsx:42`, `bulk-transfer-modal.tsx:56`). Dos 18, **17 usam `sm:max-w-*`** e continuam funcionando sem tocar em nada. **Um usa `max-w` sem prefixo** e por isso apaga o teto de mobile por `twMerge`: `goals-manager.tsx:296` (`max-w-xl`). Correcao acompanhante obrigatoria, detalhada em 4.A.3.

### 1.3 Padding das rotas autenticadas

As 11 rotas dentro do `MainLayout` (`src/App.tsx:88-99`), com o elemento raiz de cada pagina:

| Rota | Arquivo:linha | Elemento raiz hoje | Padding hoje |
|---|---|---|---|
| `/` | `src/pages/dashboard.tsx:153` | `<div className="min-h-full p-6">` | `p-6` |
| `/pipeline` | `src/pages/pipeline.tsx:5` | `<div className="flex flex-col h-full overflow-hidden">` | **nenhum** |
| `/inbox` | `src/pages/inbox.tsx:48` | `<div className="flex h-full relative">` | **nenhum** |
| `/tarefas` | `src/pages/tarefas.tsx:240` | `<div className="min-h-full p-6">` | `p-6` |
| `/deals` | `src/pages/deals.tsx:166` | `<div className="min-h-full p-6">` | `p-6` |
| `/contatos` | `src/pages/contatos.tsx:63` | `<div className="min-h-full p-6">` | `p-6` |
| `/gestao` | `src/pages/gestao.tsx:15` | `<div className="space-y-6 animate-fade-in p-6">` | `p-6` |
| `/admin` | `src/pages/admin.tsx:45` | `<div className="space-y-6 animate-fade-in p-6">` | `p-6` |
| `/super-admin` | `src/pages/super-admin.tsx:8` | `<div className="space-y-6 animate-fade-in p-6">` | `p-6` |
| `/minha-conta` | `src/pages/minha-conta.tsx:13` | `<div className="space-y-6 animate-fade-in p-6">` | `p-6` |
| `/sdr-ia` | `src/pages/sdr-ia.tsx:47` | `<div className="container max-w-7xl space-y-6 py-6">` | `py-6` + `container` |

**Achados:**

- **`/pipeline` e `/inbox` nao tem padding nenhum.** Sao telas de superficie cheia (kanban e master-detail). Nao ha padding fixo de desktop para trocar, e a instrucao e explicita: nao inventar padding onde nao existe. **Ficam de fora.** Ambas sao alvo das Fases 4 e 5.
- **`/sdr-ia` e caso especial.** O `py-6` cobre so o eixo vertical. O horizontal vem da classe `container`, que em `tailwind.config.ts:8-14` esta configurada com `padding: '2rem'` fixo, sem escala por breakpoint. Em 360px isso come 64px (18% da tela) antes de qualquer conteudo. E padding fixo de desktop, so que declarado no config em vez de na pagina. Tratamento em 4.B.
- `sdr-ia.tsx:47` e o **unico** uso de `container` em todo o `src/`. Nao ha efeito colateral em mexer nesse ponto.

Ou seja: **8 trocas diretas** (`p-6` para `p-4 sm:p-6`), **1 caso especial** (`/sdr-ia`), **2 sem acao** (`/pipeline`, `/inbox`).

---

## 2. Fora do escopo desta fase (nao tocar)

- **Shell da Fase 1**, que ja esta pronto e mergeado: `src/components/layout/main-layout.tsx`, `src/components/layout/app-sidebar.tsx`, `src/components/layout/mobile-topbar.tsx`, `src/components/ui/sheet.tsx`, `src/hooks/use-mobile.ts`.
- `src/stores/inbox.store.ts` (a leitura unica de `matchMedia` na linha 32 fica para o ciclo do inbox).
- `src/styles/globals.css`.
- Qualquer arquivo em `supabase/`.
- **`overflow-x-auto` nas tabelas** de `deals.tsx` e `result-step.tsx`. E Fase 4, criterio 12 do PRD. Esta Spec toca em `result-step.tsx`, mas so na grade de `StatCard` acima da tabela, nunca na tabela.
- **Altura de `/tarefas`** (`max-h-[calc(100vh-280px)]` em `tarefas.tsx:62`). Fase 4.
- **`/inbox` e `/pipeline`**: nenhuma mudanca de layout. Fases 4 e 5.
- `src/components/ui/alert-dialog.tsx`. Arquivo separado, com o mesmo problema de `max-h`, mas fora do escopo pedido (que nomeou `dialog.tsx`). Registrado aqui como pendencia conhecida.

---

## 3. Arquivos afetados

Nenhum arquivo criado. **17 arquivos modificados**, agrupados por bloco:

**Bloco A (dialog):** `src/components/ui/dialog.tsx`, `src/components/gestao/goals-manager.tsx`, `src/components/tarefas/create-task-modal.tsx`, `src/components/pipeline/edit-lead-modal.tsx`, `src/components/deals/new-deal-modal.tsx`, `src/components/contacts/new-contact-modal.tsx`, `src/components/admin/whatsapp-template-form.tsx`, `src/components/pipeline/import-leads-modal.tsx`

**Bloco B (padding):** `src/pages/dashboard.tsx`, `src/pages/tarefas.tsx`, `src/pages/deals.tsx`, `src/pages/contatos.tsx`, `src/pages/gestao.tsx`, `src/pages/admin.tsx`, `src/pages/super-admin.tsx`, `src/pages/minha-conta.tsx`, `src/pages/sdr-ia.tsx`

**Bloco C (grids):** `src/components/gestao/goals-manager.tsx`, `src/components/pipeline/import-steps/result-step.tsx`, `src/components/tarefas/create-task-modal.tsx`, `src/components/tarefas/edit-task-modal.tsx`, `src/pages/dashboard.tsx`, `src/pages/deals.tsx`

Cinco arquivos aparecem em mais de um bloco (`goals-manager`, `create-task-modal`, `dashboard`, `deals`, `edit-lead-modal`). **Aplicar as mudancas agrupadas por arquivo**, nao por bloco, para o diff sair limpo.

---

## 4. Especificacao

### A. `src/components/ui/dialog.tsx`

#### A.1 O que muda no `DialogContent`

Tres alteracoes na string base, todas dentro do `cn`:

| # | Alteracao | Motivo |
|---|---|---|
| 1 | `max-w-lg` vira `max-w-[calc(100vw-2rem)] sm:max-w-lg` | abaixo de 640px o modal ganha uma margem de 1rem de cada lado. Em 640px e acima o teto volta a ser exatamente `max-w-lg` (512px), identico a hoje |
| 2 | acrescentar `max-h-[90dvh]` | teto vertical. `dvh` e nao `vh` porque no Safari/Chrome mobile o `vh` ignora a barra de URL e o modal fica maior que a area visivel |
| 3 | acrescentar `overflow-y-auto` | com teto de altura, o conteudo que exceder precisa rolar dentro do modal |

Nada mais muda. `w-full`, `grid`, `gap-4`, `p-6`, `bg-background`, as animacoes e o `sm:rounded-lg` ficam como estao. Nenhuma cor nova, nenhum token novo, nenhuma CSS var nova.

#### A.2 Snippet final

```tsx
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid max-h-[90dvh] w-full max-w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:max-w-lg sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName
```

Convencoes do arquivo preservadas: `React.ComponentRef` (nao `ElementRef`), aspas simples, sem ponto e virgula, so tokens semanticos.

#### A.3 Correcao acompanhante obrigatoria: `goals-manager.tsx:296`

```
DE:    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
PARA:  <DialogContent className="sm:max-w-xl">
```

Sem isso a correcao nao funciona nesse modal. O `max-w-xl` sem prefixo cai no mesmo grupo do `max-w-[calc(100vw-2rem)]` da base, e `twMerge` deixa passar so o do consumidor. Resultado: em 390px o modal voltaria a encostar nas duas bordas. Com `sm:max-w-xl` o consumidor colide com `sm:max-w-lg` (mesmo modificador), vence acima de 640px, e abaixo disso o teto da base sobrevive. Desktop identico ao de hoje.

O `max-h-[90vh] overflow-y-auto` sai por ter virado redundante com a base.

#### A.4 Limpeza dos consumidores que agora repetem a base

Seis modais ja declaravam `max-h` e `overflow-y-auto` por conta propria. Com a base cobrindo isso, as declaracoes viram ruido e mantem `vh` onde a base ja usa `dvh`. Remover:

| Arquivo:linha | De | Para |
|---|---|---|
| `tarefas/create-task-modal.tsx:249` | `sm:max-w-md max-h-[90vh] overflow-y-auto` | `sm:max-w-md` |
| `pipeline/edit-lead-modal.tsx:206` | `max-h-[90vh] overflow-y-auto sm:max-w-lg` | `sm:max-w-lg` |
| `deals/new-deal-modal.tsx:171` | `max-h-[90vh] overflow-y-auto sm:max-w-md` | `sm:max-w-md` |
| `contacts/new-contact-modal.tsx:159` | `max-h-[90vh] overflow-y-auto sm:max-w-md` | `sm:max-w-md` |
| `admin/whatsapp-template-form.tsx:96` | `max-h-[85vh] overflow-y-auto sm:max-w-lg` | `sm:max-w-lg` |
| `pipeline/import-leads-modal.tsx:106` | `max-h-[90vh] flex flex-col sm:max-w-2xl` | `flex flex-col sm:max-w-2xl` |

Duas observacoes sobre essa tabela:

- **`whatsapp-template-form`** passa de 85vh para 90dvh. E uma folga menor, nao maior: em mobile o `dvh` desconta a barra de URL, entao 90dvh costuma ser menos altura real que 85vh. Aceito.
- **`import-leads-modal`** mantem o `flex flex-col` (vence o `grid` da base por `twMerge`) e passa a herdar `overflow-y-auto`, que antes nao tinha. Os steps internos com `max-h` proprio (`preview-step`, `result-step`) podem exibir uma segunda barra de rolagem quando o conteudo do step estourar. E cosmetico e so no caminho de importacao. Verificar no item 8 do checklist; se incomodar, resolver com `overflow-hidden` no consumidor, nunca revertendo a base.

#### A.5 Decisao sobre o botao X e o criterio 11 do PRD

**O problema, confirmado:** o `DialogPrimitive.Close` e `absolute right-4 top-4` e o `DialogContent` e o ancestral posicionado (`fixed`). Com `overflow-y-auto` no proprio `DialogContent`, ele vira o container de rolagem, e filho `absolute` rola junto com o conteudo. **Em um modal alto, o X sai da area visivel assim que o usuario rola para baixo.**

**Decisao: aceitar, sem restruturar o DOM.** Justificativa:

1. O criterio 11 do PRD exige que **os botoes de acao** continuem atingiveis. Eles vivem no `DialogFooter`, no fim do conteudo, e chegam ao alcance justamente rolando para baixo. O X nunca foi um botao de acao, e sim um atalho de descarte.
2. Radix ja entrega dois caminhos de fechamento independentes de scroll: **Esc** e **clique no backdrop**. Nenhum dos dois e afetado.
3. **Isso ja e o comportamento em producao hoje** em 6 dos 20 modais (os da tabela A.4, que ja declaravam `max-h` + `overflow-y-auto`). Nao e um regresso novo: e a generalizacao de um padrao que ja roda.

**Alternativa considerada e recusada:** envolver `{children}` em um `<div className="overflow-y-auto">` interno, deixando o `DialogContent` sem rolagem e o X ancorado. Recusada porque muda a estrutura de DOM para os 20 consumidores de uma vez: o `gap-4` do grid pararia de separar `DialogHeader`, corpo e `DialogFooter` (passariam a ser um unico filho), e os 4 modais que passam `flex flex-col` ou `overflow-y-auto` esperando ser eles proprios o container de rolagem quebrariam em silencio. Custo alto e risco espalhado para recuperar um atalho redundante.

**Consequencia a registrar:** em modal alto no mobile, o X pode sair de vista ao rolar. Fechar continua possivel por Esc, backdrop e pelos botoes do rodape.

#### A.6 Efeito colateral aceito, na faixa 512px a 640px

Hoje um modal padrao trava em 512px (`max-w-lg`) a partir de 512px de viewport. Depois da mudanca, entre 512px e 640px ele passa a acompanhar `calc(100vw-2rem)`, chegando a 608px logo abaixo do `sm`. Em 640px e acima volta aos 512px de sempre. E uma faixa estreita, o modal fica mais largo e nao mais apertado, e nao ha nenhuma rota do produto que dependa dessa largura exata. Aceito, registrado para nao virar susto na revisao visual.

---

### B. Padding de pagina

Regra: trocar o padding fixo por `p-4 sm:p-6`. Abaixo de 640px o padding cai de 24px para 16px em cada lado, devolvendo 16px de largura util. Em 640px e acima **nada muda**.

#### B.1 As 8 trocas diretas

Em todas, a unica alteracao e `p-6` virar `p-4 sm:p-6`. Nenhuma outra classe do elemento raiz e tocada.

| # | Arquivo:linha | De | Para |
|---|---|---|---|
| 1 | `src/pages/dashboard.tsx:153` | `min-h-full p-6` | `min-h-full p-4 sm:p-6` |
| 2 | `src/pages/tarefas.tsx:240` | `min-h-full p-6` | `min-h-full p-4 sm:p-6` |
| 3 | `src/pages/deals.tsx:166` | `min-h-full p-6` | `min-h-full p-4 sm:p-6` |
| 4 | `src/pages/contatos.tsx:63` | `min-h-full p-6` | `min-h-full p-4 sm:p-6` |
| 5 | `src/pages/gestao.tsx:15` | `space-y-6 animate-fade-in p-6` | `space-y-6 animate-fade-in p-4 sm:p-6` |
| 6 | `src/pages/admin.tsx:45` | `space-y-6 animate-fade-in p-6` | `space-y-6 animate-fade-in p-4 sm:p-6` |
| 7 | `src/pages/super-admin.tsx:8` | `space-y-6 animate-fade-in p-6` | `space-y-6 animate-fade-in p-4 sm:p-6` |
| 8 | `src/pages/minha-conta.tsx:13` | `space-y-6 animate-fade-in p-6` | `space-y-6 animate-fade-in p-4 sm:p-6` |

#### B.2 Caso especial: `/sdr-ia`

```
DE:    <div className="container max-w-7xl space-y-6 py-6">
PARA:  <div className="container max-w-7xl space-y-6 px-4 py-4 sm:px-8 sm:py-6">
```

Nao segue o `p-4 sm:p-6` literal, e por um motivo concreto. O horizontal desta pagina nao vem de `p-6`: vem da classe `container`, configurada com `padding: '2rem'` em `tailwind.config.ts:10`. Escrever `sm:p-6` aqui derrubaria o horizontal de desktop de 32px para 24px, que e uma regressao visual em desktop, exatamente o que esta fase nao pode causar.

Por isso os eixos vao separados:

- `px-4` abaixo de 640px, `sm:px-8` (32px) de 640px para cima, **reproduzindo o `2rem` do `container` sem alterar o desktop em um pixel**.
- `py-4` abaixo de 640px, `sm:py-6` de 640px para cima, que e o `py-6` de hoje.

**Por que o `px-4` vence o `container`:** a classe `container` do Tailwind e emitida no layer `components`; `px-4` e `sm:px-8` sao utilities, emitidas depois. Mesma especificidade, ordem de fonte decide, utilities ganham. E o mesmo raciocinio de cascata que sustentou o `surface="none"` do `sheet.tsx` na Fase 1. `twMerge` nao interfere: `container` nao pertence a nenhum grupo de padding, entao nao ha desduplicacao entre as duas.

`sdr-ia.tsx:47` e o unico uso de `container` em todo o `src/`, entao a decisao nao vaza para nenhuma outra tela.

#### B.3 Sem acao

| Rota | Arquivo:linha | Motivo |
|---|---|---|
| `/pipeline` | `src/pages/pipeline.tsx:5` | raiz e `flex flex-col h-full overflow-hidden`, sem padding. Superficie cheia do kanban. Nao inventar padding. Fase 5 |
| `/inbox` | `src/pages/inbox.tsx:48` | raiz e `flex h-full relative`, sem padding. Master-detail de superficie cheia. Fase 5 |

---

### C. `grid-cols-N` sem breakpoint

Regra padrao: `grid-cols-N` vira `grid-cols-1 sm:grid-cols-N`. Onde uma coluna so ficar absurda, `grid-cols-2 sm:grid-cols-N`. Onde a grade ja couber na largura de mobile, **nao mexer**: trocar por trocar introduz risco visual sem beneficio.

Todas as medidas abaixo assumem 360px de viewport, sem sidebar (drawer), e ja com o `p-4` do bloco B aplicado.

#### C.1 Resumo das 16 ocorrencias

| # | Arquivo:linha | Acao | Padrao |
|---|---|---|---|
| 1 | `goals-manager.tsx:327` | `grid-cols-1 sm:grid-cols-2` | padrao |
| 2 | `goals-manager.tsx:363` | `grid-cols-1 sm:grid-cols-2` | padrao |
| 3 | `color-picker.tsx:28` | **sem mudanca** | justificado |
| 4 | `edit-lead-modal.tsx:215` | **sem mudanca**, pendencia registrada | justificado |
| 5 | `result-step.tsx:48` | `grid-cols-1 sm:grid-cols-3` | padrao |
| 6 | `create-task-modal.tsx:270` | `grid-cols-2 sm:grid-cols-4` | excecao |
| 7 | `create-task-modal.tsx:357` | `grid-cols-1 sm:grid-cols-2` | padrao |
| 8 | `edit-task-modal.tsx:123` | `grid-cols-2 sm:grid-cols-4` | excecao |
| 9 | `theme-customizer.tsx:187` | **sem mudanca** | justificado |
| 10 | `monthly-comparison-grid.tsx:151` | **sem mudanca** | ja mobile-first |
| 11 | `monthly-comparison-grid.tsx:160` | **sem mudanca** | ja mobile-first |
| 12 | `contact-panel.tsx:320` | **sem mudanca** | fora do escopo (Fase 5) |
| 13 | `dashboard.tsx:128` | `flex flex-col gap-1.5` + `h-4` | skeleton desalinhado |
| 14 | `deals.tsx:268` | `grid-cols-1 sm:grid-cols-3` | espelha 15 e 16 |
| 15 | `deals.tsx:293` | `grid-cols-1 sm:grid-cols-3` | padrao |
| 16 | `deals.tsx:337` | `grid-cols-1 sm:grid-cols-3` | padrao |

**9 mudancas, 7 sem acao.** Detalhe caso a caso a seguir.

#### C.2 Casos no padrao `1 -> N`

**#1 e #2, `goals-manager.tsx:327` e `:363`**

```
DE:    <div className="grid grid-cols-2 gap-3">
PARA:  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

Dois pares de campos de formulario dentro de um modal: Mes/Ano (`:327`) e Inicio/Fim, dois `<input type="date">` (`:363`). Em 390px o modal util fica em 310px; cada `<input type="date">` sobra com 149px, e o widget de data nativo do iOS e do Chrome Android nao cabe com folga nessa largura. Campo de formulario empilhado em mobile e o comportamento esperado, entao o padrao se aplica direto.

**#5, `result-step.tsx:48`**

```
DE:    <div className="grid grid-cols-3 gap-3">
PARA:  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
```

Tres `StatCard` (Importados, Pulados, Erros). O `StatCard` e `flex items-center gap-3 px-4 py-3` com um icone `h-5 w-5`: 20px de icone + 12px de gap + 32px de padding horizontal = **64px de estrutura fixa por card**. O modal e `sm:max-w-2xl`, que abaixo de 640px passa a valer `calc(100vw-2rem)`: em 390px sao 358px, menos o `p-6` do dialog sao 310px, menos 24px de gap, dividido por 3 = **95px por card**. Sobram 31px para o bloco de texto, e o rotulo "Importados" em `text-xs` mede cerca de 62px. Estoura. Empilhar resolve e nao tem contraindicacao: sao tres blocos curtos de leitura.

Lembrete de escopo: **so a grade. A tabela logo abaixo (`result-step.tsx:57`) nao e tocada, e Fase 4.**

**#7, `create-task-modal.tsx:357`**

```
DE:    <div className="grid gap-4 grid-cols-2">
PARA:  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
```

Bloco "Dados da reuniao": um `<input type="datetime-local">` e um `<Select>` de duracao. O modal e `sm:max-w-md`, ainda mais estreito que o caso #1, e `datetime-local` e o controle nativo mais largo que existe. Empilhar e obrigatorio.

**#15 e #16, `deals.tsx:293` e `:337`**

```
DE:    <div className="grid grid-cols-3 gap-2">
PARA:  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
```

Breakdown de tres numeros dentro dos KPI cards de `/deals`. O card externo ja e `grid-cols-1 sm:grid-cols-3` (`deals.tsx:282`), entao em mobile ocupa a largura toda: 328px, menos o `p-5` do card sao 288px, menos 16px de gap, dividido por 3 = **90px por coluna**. O `:337` mostra valores monetarios via `fmt()`, e "R$ 12.500,00" em `text-sm` mede cerca de 95px. Estoura por pouco, e estoura de vez com valores maiores.

**Observacao honesta sobre esse caso.** A largura mais apertada dessa grade **nao e em 360px**. E logo acima de 640px, onde o card externo ja virou 1/3 mas a pagina ainda nao tem sidebar: (640 - 48) / 3 = 181px de card, menos `p-5`, dividido por 3 = **42px por coluna**. Isso e mais apertado que os 90px de 360px e que os 51px de 1024px com sidebar. Ou seja, existe um aperto pre-existente na faixa 640px a 1024px que esta mudanca **nao resolve** (ela so age abaixo de 640px). Nao ampliei o escopo para cobrir isso porque exigiria repensar o KPI card, o que e trabalho de design e nao de correcao mecanica. **Fica registrado como pendencia para uma passada futura em `/deals`.**

**#14, `deals.tsx:268`**

Mesma troca das #15 e #16. E o skeleton de carregamento que imita esses mesmos cards. Se ficar em `grid-cols-3` enquanto os cards reais empilham, o layout salta na transicao de skeleton para dados.

#### C.3 Casos de excecao `2 -> N`

**#6 e #8, `create-task-modal.tsx:270` e `edit-task-modal.tsx:123`**

```
DE:    <div className="grid grid-cols-4 gap-2">
PARA:  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
```

Seletor de tipo de tarefa: 4 botoes `flex flex-col items-center gap-1 rounded-lg border p-2 text-xs`, cada um com icone em cima e rotulo embaixo. **Uma coluna ficaria absurda:** viraria uma pilha de 4 botoes largos e baixos, ocupando a altura toda de um modal que ja rola, e destruiria a leitura de "escolha um entre quatro" que a grade compacta comunica. Em 2 colunas, dentro do `sm:max-w-md` (310px uteis em 390px), cada botao fica com 151px, folgado para um icone e um rotulo `text-xs`. Duas linhas de dois, o padrao de seletor compacto em mobile.

#### C.4 Casos sem mudanca

**#3, `color-picker.tsx:28` (`grid-cols-4`)**

Paleta de swatches `h-6 w-6` dentro de um `PopoverContent` com `w-auto p-2`. Largura total: 4 x 24px + 3 x 6px de gap + 16px de padding = **130px**. Cabe com folga enorme em 360px, e o popover nem sequer se estica com a pagina (e `w-auto`). Empilhar transformaria um seletor de cores compacto em uma lista vertical de 4 bolinhas por linha ou pior. **Nao tocar.** O PRD ja apontava este arquivo como candidato a excecao, e a medicao confirma.

**#9, `theme-customizer.tsx:187` (`grid-cols-3`)**

Tres botoes de tema: "Claro", "Escuro", "Areia". Dentro de `CardContent` (`p-6`) numa pagina que passa a ter `p-4`: 360 - 32 - 48 = 280px, menos 24px de gaps, dividido por 3 = **85px por botao**. O botao e `p-4` (32px horizontais), sobrando 53px para o texto; "Escuro" em `text-sm` mede cerca de 48px. Cabe. Alem disso sao **tres opcoes mutuamente exclusivas de um mesmo eixo**, e a grade lado a lado e o que comunica isso. O PRD ja citava este arquivo como excecao esperada, e a medicao concorda. **Nao tocar.**

**#10 e #11, `monthly-comparison-grid.tsx:151` e `:160`**

Ja sao `grid-cols-2 lg:grid-cols-4`. Sao exatamente a excecao `2 -> N` que esta Spec adota nos casos #6 e #8, so que ja escrita assim. O grep as capturou por causa do `grid-cols-2` base sem prefixo, mas o comportamento em mobile ja esta correto. **Nao tocar.**

**#12, `contact-panel.tsx:320` (`grid-cols-2`)**

Par de campos Instagram e LinkedIn no painel de contato do inbox. O painel tem largura propria e fixa (`w-[340px] max-w-[85vw]`, `inbox.tsx:78`), **nao acompanha a largura da pagina**. Em 360px o painel fica com 306px e cada campo com 133px, que para um `Input` `h-8 text-sm` com icone e apertado mas nao quebra. Mais importante: **este e um componente do `/inbox`**, tela que a Fase 5 vai reestruturar por inteiro (o painel vira overlay em mobile). Mexer agora e retrabalho garantido, com risco de conflitar com a Fase 5. **Nao tocar nesta fase**, tratar no ciclo do inbox.

**#4, `edit-lead-modal.tsx:215` (`grid w-full grid-cols-3`)**

Nao e grade de conteudo: e a `TabsList` de tres abas ("Informacoes", "Tarefas", "Historico"). `grid-cols-1` seria absurdo, transformaria uma barra de abas em uma pilha vertical de tres botoes.

Vale registrar a medida, porque ha um problema real e ele nao e resolvido aqui. Em 390px o dialog util fica em 310px, dando 103px por aba. O `TabsTrigger` (`tabs.tsx:29`) tem `px-3` (24px) e, principalmente, **`whitespace-nowrap`**: "Informacoes" em `text-sm` mede cerca de 88px, que somados aos 24px de padding dao 112px contra 103px disponiveis. **Estoura em cerca de 9px.**

Corrigir isso direito nao e trocar a contagem de colunas: e reduzir tipografia so em mobile, encurtar rotulos, ou dar rolagem horizontal a `TabsList`. As tres opcoes sao decisao de UI, nao ajuste mecanico, e `edit-lead-modal` e componente de `/pipeline`, area da Fase 5. **Sem mudanca nesta fase, pendencia registrada** contra o criterio 14 do PRD.

**#13, `dashboard.tsx:128` (`grid-cols-3`)**

Este e diferente de todos os outros, e o PRD o classificou errado. E o `KpiCardSkeleton`, e o componente real que ele deveria imitar, `Breakdown` (`dashboard.tsx:80-83`), e assim:

```tsx
<div className="flex flex-col gap-1.5">
  {items.map((item) => (
    <div key={item.label} className="flex items-center justify-between">
      ...
```

Linhas empilhadas, `justify-between`, em **qualquer** viewport. O skeleton usa 3 colunas horizontais. Ele nunca correspondeu ao componente real, nem em desktop. Trocar por `grid-cols-1 sm:grid-cols-3` deixaria o desktop errado do mesmo jeito. A correcao certa e alinhar o skeleton ao real:

```
DE:    <div className="grid grid-cols-3 gap-2">
         {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
       </div>

PARA:  <div className="flex flex-col gap-1.5">
         {[1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
       </div>
```

O `h-8` cai para `h-4` porque as linhas reais sao `text-xs`, nao blocos de 32px. Resultado: o skeleton para de saltar na troca por dados, em desktop e em mobile, e some mais um `grid-cols-3` ativo abaixo de 640px (criterio 10 do PRD).

**Este e o unico ponto desta Spec que muda algo alem de classes de breakpoint.** Sinalizado de proposito. Se a preferencia for manter o diff estritamente mecanico, a alternativa minima e `grid-cols-1 sm:grid-cols-3`, que satisfaz o criterio 10 mas deixa o skeleton desalinhado do real em desktop. **A recomendacao e a versao espelhada acima.**

---

## 5. Ordem de execucao sugerida

Agrupado por arquivo, para o diff ficar legivel:

1. `src/components/ui/dialog.tsx` (A.1, A.2)
2. `src/components/gestao/goals-manager.tsx` (A.3 + C #1 e #2)
3. `src/components/tarefas/create-task-modal.tsx` (A.4 + C #6 e #7)
4. `src/components/tarefas/edit-task-modal.tsx` (C #8)
5. `src/components/pipeline/edit-lead-modal.tsx` (A.4)
6. `src/components/deals/new-deal-modal.tsx` (A.4)
7. `src/components/contacts/new-contact-modal.tsx` (A.4)
8. `src/components/admin/whatsapp-template-form.tsx` (A.4)
9. `src/components/pipeline/import-leads-modal.tsx` (A.4)
10. `src/components/pipeline/import-steps/result-step.tsx` (C #5)
11. `src/pages/dashboard.tsx` (B #1 + C #13)
12. `src/pages/deals.tsx` (B #3 + C #14, #15, #16)
13. `src/pages/tarefas.tsx` (B #2)
14. `src/pages/contatos.tsx` (B #4)
15. `src/pages/gestao.tsx` (B #5)
16. `src/pages/admin.tsx` (B #6)
17. `src/pages/super-admin.tsx` (B #7)
18. `src/pages/minha-conta.tsx` (B #8)
19. `src/pages/sdr-ia.tsx` (B.2)

Rodar `npm run build` a cada bloco (apos o item 1, apos o item 10, ao final).

---

## 6. Verificacao

### 6.1 Automatica

| # | Comando | Criterio de aceite |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida |
| 2 | `npm run build` | sem erro |
| 3 | `npm run lint` | paridade exata com o baseline de `develop`. **Medir o baseline antes de editar** (`git stash -u`), porque a `develop` ja carrega erros pre-existentes. Zero erro novo, nao "zero erro" |
| 4 | `grep -rnE "(^\|[^:A-Za-z-])grid-cols-[34]([^0-9]\|$)" src --include="*.tsx"` | so podem sobrar `color-picker.tsx:28`, `edit-lead-modal.tsx:215`, `theme-customizer.tsx:187` e as duas de `monthly-comparison-grid`, todas justificadas em C.4 |
| 5 | `git status` | nada em `supabase/`, nada em `src/stores/`, nada em `src/styles/`, nada nos 5 arquivos do shell da Fase 1 |

### 6.2 Manual, em 360px, 390px e 414px

| # | Verificacao | Criterio do PRD |
|---|---|---|
| 6 | Nenhuma das 11 rotas rola horizontalmente no `<body>` | 1 |
| 7 | Modal alto (criar tarefa, editar lead, novo contato, importar leads) cabe na viewport e rola por dentro | 11 |
| 8 | `import-leads-modal`: percorrer upload, mapping, preview, result. Confirmar que nao aparece barra de rolagem dupla | A.4 |
| 9 | Botoes do `DialogFooter` alcancaveis rolando ate o fim | 11 |
| 10 | Fechar por Esc e por clique no backdrop funciona em modal rolado ate o fim | A.5 |
| 11 | Nenhum `grid-cols-3` ou `-4` ativo abaixo de 640px, fora das excecoes de C.4 | 10 |
| 12 | `/deals`: KPI cards empilhados, valores monetarios inteiros, sem quebra | 14 |
| 13 | `/` dashboard: skeleton de carregamento nao salta ao virar dados, em mobile e em desktop | C #13 |
| 14 | `/sdr-ia`: padding lateral confortavel em 360px | 14 |

### 6.3 Nao regressao em desktop (1280px e 1440px)

| # | Verificacao |
|---|---|
| 15 | As 11 rotas com padding visualmente identico ao de hoje (24px, e 32px em `/sdr-ia`) |
| 16 | Modal padrao continua em 512px de largura; os `sm:max-w-sm`, `md`, `xl` e `2xl` nas larguras de sempre |
| 17 | `/deals` e `/` com KPI cards em 3 colunas e breakdowns em 3 colunas, como hoje |
| 18 | Seletor de tipo de tarefa em 4 colunas |
| 19 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie. Esta fase nao toca em token nem em CSS var |

---

## 7. Pendencias registradas, fora do escopo

Levantadas durante a reverificacao. Nenhuma e bloqueante para esta fase.

| Pendencia | Onde | Destino |
|---|---|---|
| `TabsList` de 3 abas estoura cerca de 9px em 390px | `edit-lead-modal.tsx:215` | Fase 5 (pipeline). Criterio 14 |
| Breakdown dos KPI cards aperta na faixa 640px a 1024px (42px por coluna), aperto pre-existente que esta fase nao alcanca | `deals.tsx:293`, `:337` | passada futura em `/deals` |
| `alert-dialog.tsx` tem o mesmo problema de `max-h` que o `dialog.tsx` | `src/components/ui/alert-dialog.tsx` | fora do escopo pedido, avaliar depois |
| Campos Instagram e LinkedIn em 2 colunas dentro do painel de 340px | `contact-panel.tsx:320` | Fase 5 (inbox) |
| `inbox.store.ts:32` le `matchMedia` uma unica vez, sem listener | `src/stores/inbox.store.ts` | ciclo do inbox, ja registrado na Fase 1 |
