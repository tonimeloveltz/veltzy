# SPEC - Responsividade Fase 1 (Fundacao)

**Referencia:** `docs/PRD-responsividade.md`, secao 4, Fase 1
**Escopo:** Somente a fundacao do shell. Fases 2 a 6 do PRD ficam de fora.
**Migration:** nenhuma. Mudanca 100% frontend.

**Marco de entrega:** nenhuma tela apresenta scroll horizontal causado pelo shell. O conteudo interno das paginas continua como esta (grids, tabelas, modais e paddings sao Fase 2).

---

## Resumo

3 arquivos novos, 2 modificados.

| # | Arquivo | Acao |
|---|---|---|
| 1 | `src/hooks/use-mobile.ts` | criar |
| 2 | `src/components/ui/sheet.tsx` | criar |
| 3 | `src/components/layout/mobile-topbar.tsx` | criar |
| 4 | `src/components/layout/app-sidebar.tsx` | modificar |
| 5 | `src/components/layout/main-layout.tsx` | modificar |

A ordem acima respeita as dependencias: o hook e o sheet nao dependem de nada; o topbar e a sidebar consomem o sheet; o main-layout consome sidebar e topbar.

**Sem dependencia nova.** `@radix-ui/react-dialog@^1.1.15`, `class-variance-authority@^0.7.1` e `lucide-react@^1.8.0` ja estao no `package.json`.

### Nao tocar nesta fase

- `src/stores/inbox.store.ts` (a leitura unica do `matchMedia` na linha 32 fica para o ciclo do inbox, Fase 5)
- qualquer pagina em `src/pages/`
- qualquer arquivo em `supabase/`
- `src/styles/globals.css`. **Nao criar** `--sidebar-primary-foreground`, `--sidebar-accent-foreground` nem `--sidebar-ring`: essas vars pertencem ao contrato do `sidebar.tsx` do shadcn, que esta fora do escopo desta fase. As vars `--sidebar-*` existentes ficam intocadas.
- `src/components/ui/dialog.tsx` (o `max-h` dos modais e Fase 2)

---

## 1. CRIAR `src/hooks/use-mobile.ts`

Hook novo. Um hook por arquivo, conforme CLAUDE.md. Nao existe nada equivalente no projeto hoje (varredura dos 57 hooks confirmou).

**Contrato:** retorna `true` quando a viewport esta **abaixo** de 1024px (breakpoint `lg`, definido no PRD secao 3). O corte usa `max-width: 1023.98px` para nao colidir com o `lg:` do Tailwind, que e `min-width: 1024px`. Em 1024px exatos o hook retorna `false` e o Tailwind aplica `lg:`, ou seja, os dois concordam.

Pontos nao obvios que a implementacao precisa respeitar:
- **Guarda de SSR.** O estado inicial usa `typeof window === 'undefined'` para nao quebrar fora do browser. O projeto e Vite SPA, mas a guarda protege tambem o ambiente de teste (Vitest/jsdom), onde `matchMedia` pode nao existir. `inbox.store.test.ts` ja documenta esse cuidado.
- **Listener obrigatorio.** Usar `addEventListener('change', ...)` na `MediaQueryList` e remover no cleanup. Este e o ponto que o `inbox.store.ts:32` erra hoje: le uma vez e nunca mais atualiza. Criterio de aceite 8 do PRD (redimensionar 1200px para 800px e voltar) depende disso.
- **Estado inicial sincrono**, via inicializador lazy do `useState`. Se comecasse em `false` e so corrigisse no `useEffect`, o mobile renderizaria um frame com o layout de desktop.

```ts
import { useState, useEffect } from 'react'

// Corte alinhado ao breakpoint lg do Tailwind (min-width: 1024px).
// 1023.98 evita que hook e classe utilitaria fiquem ambos ativos em 1024px.
const MOBILE_QUERY = '(max-width: 1023.98px)'

const getMatches = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(MOBILE_QUERY).matches
}

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(getMatches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)

    // Ressincroniza: a viewport pode ter mudado entre o render e o efeito.
    setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
```

**Nota de uso.** Na Fase 1 o layout responsivo e resolvido por classes Tailwind (`hidden lg:flex`, `lg:hidden`), que sao mais baratas que re-render. O `useIsMobile` entra apenas onde a decisao precisa existir em JavaScript, e nesta fase isso e um unico lugar: fechar o drawer automaticamente ao cruzar para desktop (item 5.4). Nao substituir as classes utilitarias por renderizacao condicional baseada no hook.

---

## 2. CRIAR `src/components/ui/sheet.tsx`

Componente `sheet` padrao do shadcn/ui. Construido sobre `@radix-ui/react-dialog`, o **mesmo primitivo** que `src/components/ui/dialog.tsx` ja usa. Nao adicionar dependencia.

Convencoes a seguir, espelhando o `dialog.tsx` do projeto:
- `React.ComponentRef<typeof X>` no `forwardRef`, **nao** `React.ElementRef` (que esta deprecado). O `dialog.tsx:12` ja usa `ComponentRef`.
- aspas simples, sem ponto e virgula
- somente tokens semanticos, nunca cor direta
- variantes com `cva`, conforme CLAUDE.md

O que o Radix entrega de graca e que o drawer manual de `automation-logs-drawer.tsx` nao tem: focus trap, fechamento no Esc, trava de scroll do body e atributos ARIA. Isso cobre os criterios de aceite 6 e 7 do PRD sem codigo nosso.

```tsx
import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right: 'inset-y-0 right-0 h-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
      },
    },
    defaultVariants: { side: 'right' },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export { Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent, SheetTitle, SheetDescription }
```

**Acessibilidade, ponto obrigatorio.** O Radix Dialog emite warning em console se o conteudo nao tiver um `Title` acessivel. A sidebar nao mostra titulo visivel no drawer, entao o consumidor (item 4) deve incluir um `SheetTitle` dentro de `sr-only`. Nao omitir.

---

## 3. CRIAR `src/components/layout/mobile-topbar.tsx`

Componente novo. Existe porque **o projeto nao tem header compartilhado** (PRD 1.1): cada pagina renderiza o proprio cabecalho inline, entao o hamburguer nao teria onde morar.

**Contrato de props:**

```ts
interface MobileTopbarProps {
  onMenuClick: () => void
}
```

Recebe o handler de abertura por prop. **Nao** cria estado proprio: o estado do drawer vive no `main-layout` (item 5).

**Estrutura e comportamento:**
- Raiz `<header>` com `lg:hidden`, ou seja, some a partir de 1024px, complementar ao `hidden lg:flex` da sidebar. Junto com o `shrink-0`, garante que o desktop fica identico ao de hoje (criterio de aceite 3).
- Altura `h-14` (56px), `border-b border-border`, fundo `bg-background`.
- Esquerda: botao hamburguer (icone `Menu` do lucide-react) chamando `onMenuClick`. Precisa de `aria-label="Abrir menu"` e area de toque de no minimo 44x44px (criterio 13). `h-11 w-11` resolve; nao usar o `size="icon"` do Button, que e 36px.
- Centro/esquerda: o mesmo bloco de marca da sidebar, quadrado com a inicial da empresa + "Veltzy" + `company?.name` truncado. Usar `useAuth()` para ler `company`, igual `app-sidebar.tsx:55`.
- Direita: `<NotificationCenter />`, que nao recebe props.
- Nao incluir `ThemeToggle` nem o dropdown de perfil: os dois continuam acessiveis dentro do drawer, e o topbar precisa ficar enxuto em 360px.

**Sobre `sticky`:** o PRD pediu topbar sticky. Na estrutura do item 5 o topbar e irmao **acima** do container de scroll (`<main>` tem `overflow-y-auto`), entao ele ja permanece fixo no topo estruturalmente, sem precisar de `sticky top-0` nem de `z-index`. Aplicar `shrink-0` para nao ser comprimido pelo flex. O resultado visivel e o que o PRD descreve; a classe `sticky` seria inerte aqui.

**Duplicacao aceita do NotificationCenter.** Com o drawer aberto no mobile, existirao duas instancias montadas (uma no topbar, uma dentro do drawer). E aceitavel e deliberado: o React Query compartilha o cache da query de notificacoes, entao nao ha requisicao duplicada, e o `SheetContent` do Radix desmonta o conteudo quando fechado, que e o estado predominante. A alternativa seria alterar o JSX interno da sidebar, o que esta explicitamente vetado no item 4.

---

## 4. MODIFICAR `src/components/layout/app-sidebar.tsx`

Arquivo hoje com 230 linhas. **O JSX interno nao muda.** A unica alteracao no conteudo e o `onClick` dos `NavLink` (detalhado abaixo). Nav, roles (`useRoles`), feature flag `sdr_agent_v2`, badge de tarefas atrasadas, bloco "Usuarios online", `ThemeToggle`, `NotificationCenter`, dropdown de perfil e toggle de disponibilidade permanecem exatamente como estao.

### 4.1 Extrair `SidebarContent`

Criar, **no mesmo arquivo**, um componente interno `SidebarContent` que recebe:

```ts
interface SidebarContentProps {
  onNavigate?: () => void
}
```

`SidebarContent` passa a conter todo o corpo atual da sidebar: as linhas 95 a 224 de hoje, ou seja, do bloco de marca ate o rodape com perfil e toggle de disponibilidade. Todos os hooks que hoje vivem em `AppSidebar` (`useAuth`, `useRoles`, `useToggleAvailability`, `useTeamMembers`, `useMyTaskCounts`, `useFeatureFlag`) **migram para dentro de `SidebarContent`**, porque e la que os dados sao consumidos.

O que **nao** vai para dentro de `SidebarContent`: o elemento `<aside>` da linha 89 e suas classes de container. `SidebarContent` retorna um fragmento com os blocos filhos. O container e responsabilidade de cada um dos dois wrappers, que precisam de classes diferentes.

`useThemeSettings()` fica em `AppSidebar` (o wrapper), nao em `SidebarContent`, porque `isGlassSidebar` e aplicado no container. Ver 4.4.

Nao exportar `SidebarContent`. E detalhe de implementacao deste arquivo.

### 4.2 Nova assinatura de `AppSidebar`

Hoje `AppSidebar` nao recebe props. Passa a receber:

```ts
interface AppSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

Componente controlado. O estado vive no `main-layout` (item 5), porque o `mobile-topbar` tambem precisa dele.

### 4.3 Renderizar em dois lugares

`AppSidebar` retorna um fragmento com os dois wrappers:

```tsx
const AppSidebar = ({ open, onOpenChange }: AppSidebarProps) => {
  const { data: themeSettings } = useThemeSettings()
  const isGlassSidebar = themeSettings?.sidebar_style === 'glass'
  const surface = isGlassSidebar ? 'sidebar-glass' : 'bg-sidebar'

  return (
    <>
      {/* Desktop: coluna fixa, identica a de hoje */}
      <aside
        className={cn(
          'hidden lg:flex h-screen w-64 flex-col border-r border-sidebar-border text-sidebar-foreground',
          surface
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile: drawer sobreposto */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          className={cn(
            'flex w-[280px] max-w-[85vw] flex-col gap-0 p-0 border-r border-sidebar-border text-sidebar-foreground lg:hidden',
            surface
          )}
        >
          <SheetTitle className="sr-only">Menu de navegacao</SheetTitle>
          <SidebarContent onNavigate={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
```

Detalhes que importam:
- A unica mudanca na classe do `<aside>` e o prefixo `hidden lg:` antes do `flex`. O resto (`h-screen w-64 flex-col border-r ...`) fica igual, o que sustenta o criterio de aceite 3 (desktop sem regressao).
- No `SheetContent`: `p-0` e `gap-0` anulam o padding e o gap default do `sheetVariants`, ja que os blocos internos trazem o proprio espacamento. `h-full` ja vem da variante `side="left"`.
- `w-[280px] max-w-[85vw]` conforme PRD secao 3.
- `lg:hidden` no `SheetContent` e cinto de seguranca: se o drawer ficar aberto e a janela crescer, ele nao aparece por cima do desktop. A trava principal e o item 4.4.
- O `SheetTitle` em `sr-only` e obrigatorio (ver nota de acessibilidade do item 2).
- `SidebarContent` **sem** `onNavigate` no desktop: navegar por la nao deve fechar nada.

### 4.4 Fechar o drawer ao navegar

Dentro de `SidebarContent`, cada `NavLink` (hoje linha 115) ganha:

```tsx
onClick={() => onNavigate?.()}
```

Sem `onNavigate` (desktop), e no-op. Com (mobile), fecha o drawer. Cobre o criterio de aceite 6.

O fechamento por backdrop e por Esc **nao precisa de codigo**: vem do Radix via `onOpenChange`.

**Fechar tambem ao cruzar para desktop.** Unico uso do `useIsMobile` nesta fase. Se o usuario abre o drawer em 800px e a janela cresce para 1200px, o estado `open` continua `true` e o drawer voltaria ao encolher, alem de manter a trava de scroll do body ativa. Em `AppSidebar`:

```tsx
const isMobile = useIsMobile()

useEffect(() => {
  if (!isMobile && open) onOpenChange(false)
}, [isMobile, open, onOpenChange])
```

Isso atende o criterio de aceite 8. `onOpenChange` vem do `useState` do main-layout, que e estavel, entao a dependencia nao causa loop.

### 4.5 Imports a acrescentar

`useEffect` do react, `Sheet`, `SheetContent` e `SheetTitle` de `@/components/ui/sheet`, e `useIsMobile` de `@/hooks/use-mobile`. `cn` e `useThemeSettings` ja estao importados.

---

## 5. MODIFICAR `src/components/layout/main-layout.tsx`

Arquivo hoje com 20 linhas. Passa a segurar o estado do drawer e montar o topbar.

**Estado.** `useState<boolean>(false)` local. Nao criar store Zustand: o estado e efemero, so importa para o shell e nao e lido por nenhuma outra tela. O PRD (secao 5) tira persistencia do escopo, entao o drawer sempre comeca fechado.

**Nova estrutura.** O flex row externo permanece. A mudanca e um wrapper de coluna novo entre a sidebar e o `<main>`, para o topbar ficar acima da area de conteudo sem afetar a sidebar:

```tsx
const MainLayout = () => {
  usePresenceHeartbeat()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-minimal">
          <Outlet />
        </main>
      </div>
      <ErrorReportButton />
    </div>
  )
}
```

Notas:
- `usePresenceHeartbeat()` continua no topo, inalterado.
- `min-w-0` migra para o wrapper de coluna e e mantido tambem no `<main>`. E o que impede conteudo largo (kanban, tabelas) de esticar o flex item e gerar scroll horizontal no body. Nao remover de nenhum dos dois.
- No desktop, `AppSidebar` renderiza o `<aside>` e o `MobileTopbar` some por `lg:hidden`: a arvore resultante e equivalente a de hoje.
- `<ErrorReportButton />` continua irmao direto do container externo, sem mudanca.

---

## 6. Verificacao

Comandos:

```bash
npm run lint
npm run build
```

Checagem manual, nos viewports 360, 390, 414, 768, 1024 e 1280:

| # | Verificacao | Criterio do PRD |
|---|---|---|
| 1 | Nenhuma das 11 rotas autenticadas gera scroll horizontal no body por causa do shell | 1 |
| 2 | Abaixo de 1024px o `<aside>` nao ocupa espaco e o conteudo usa 100% da largura util | 2 |
| 3 | Em 1024px e acima o layout e visualmente identico ao anterior | 3 |
| 4 | Hamburguer aparece so abaixo de 1024px e abre o drawer pela esquerda com backdrop | 4 |
| 5 | Drawer mostra os mesmos itens da sidebar de desktop, respeitando role e flag `sdr_agent_v2` | 5 |
| 6 | Drawer fecha ao tocar num item de nav, no backdrop e no Esc | 6 |
| 7 | Com drawer aberto, o conteudo atras nao rola e o foco fica preso dentro do drawer | 7 |
| 8 | Redimensionar 1200px para 800px e voltar nao deixa o layout inconsistente; drawer aberto em 800px fecha ao passar de 1024px | 8 |
| 9 | Variante `sidebar-glass` correta nos tres temas (light, dark, sand), no desktop e no drawer | 9 |
| 10 | Botao hamburguer com area de toque de no minimo 44x44px | 13 |
| 11 | Sem `any` introduzido e sem cor hardcoded | 18 |
| 12 | `git status` nao mostra nenhum arquivo alterado em `supabase/` | 19 |

Verificacao adicional, especifica desta fase:

| # | Verificacao |
|---|---|
| 13 | Console sem warning de acessibilidade do Radix ao abrir o drawer (valida o `SheetTitle` em `sr-only`) |
| 14 | Badge de tarefas atrasadas, bloco "Usuarios online" e toggle de disponibilidade funcionam identicamente no drawer e no desktop |
| 15 | `src/styles/globals.css` nao foi modificado |
| 16 | `src/stores/inbox.store.ts` nao foi modificado |

**Fora de escopo, esperado continuar quebrado apos esta fase:** grids `grid-cols-3` sem breakpoint, modais altos estourando verticalmente, `p-6` fixo, tabelas de `deals.tsx` e `result-step.tsx` sem `overflow-x-auto`, e o layout de tres colunas do inbox. Tudo isso e Fase 2 em diante.
