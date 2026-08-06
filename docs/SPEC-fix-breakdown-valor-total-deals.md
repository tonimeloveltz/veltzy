# Spec - Fix do breakdown do card Valor Total (/deals)

**Branch base:** `develop` apos o merge da Fase 5A
**Escopo:** extrair o `Breakdown` que ja existe no dashboard e reutiliza-lo em `/deals`.
**Origem:** pendencia 7 da Spec da Fase 5 (`docs/SPEC-responsividade-fase5-inbox.md`, secao 9), reaberta por bug reportado em 2026-08-04 com viewport de 1336px.

> **Revisao 2, de 2026-08-04.** A versao 1 desta Spec especificava um layout de linhas escrito do zero para o `deals.tsx`. **Superada por reuso**, por sugestao da usuaria. O dashboard ja resolvia este mesmo problema, e a solucao de la e melhor que a que eu tinha derivado. O diagnostico das secoes 1 a 3 continua valendo integralmente; a secao 4 mudou de abordagem.

---

## 1. O defeito

`deals.tsx:337` monta o breakdown do card **Valor Total** em `grid grid-cols-1 sm:grid-cols-3 gap-2`. No Tailwind, `grid-cols-3` e `repeat(3, minmax(0, 1fr))`.

O `minmax(0, ...)` permite que a coluna encolha **abaixo da largura do conteudo**. O texto entao nao empurra a coluna nem gera scroll: ele **vaza por cima da coluna vizinha**. Com valores na casa dos milhoes os tres numeros se encostam e ficam ilegiveis.

## 2. Medicao

O card fica **mais estreito conforme o viewport cresce**, porque a partir de `lg` os tres KPI cards dividem a largura do `<main>`. Larguras com sidebar de 256px, scrollbar do `<main>` (~15px), `p-6` da pagina, `gap-6` entre cards e `p-5` do `cardBase`:

| Viewport | Largura do card | Por coluna do breakdown | Cabe `R$ 2.474.055,76`? |
|---|---|---|---|
| < 1024px | card ocupa a linha inteira | folgado | sim |
| 1024px | ~219px | **~54px** | nao |
| **1336px (reportado)** | ~306px | **~91px** | **nao** |
| 1440px | ~362px | ~102px | nao |
| 1600px | ~416px | ~120px | no limite |

**Tres colunas so param de colidir por volta de 1600px** com valores de 7 digitos.

## 3. Por que nao e um fix de breakpoint

A largura necessaria depende da **magnitude do dado**, nao do viewport. Um tenant com valores na casa dos milhares (`R$ 71.685,54`) nao quebra em 1336px; o da screenshot quebra.

Trocar `sm:` por `xl:` ou `2xl:` faria a tela parecer certa hoje e voltaria a quebrar quando qualquer cliente crescesse de faixa. **Rejeitado.** Foi por isso que a pendencia 7 voltou: a Fase 3 tratou o sintoma na faixa de 640 a 1024px e a causa continuou de pe.

Tambem foram avaliadas e rejeitadas **notacao compacta** (perde centavos e nao ha nenhum uso de `notation: 'compact'` na base) e **container queries** (dependencia nova, e ainda dependeria da magnitude).

## 4. A correcao: reutilizar o `Breakdown` do dashboard

`dashboard.tsx:326` monta **exatamente o mesmo card**, com os mesmos tres valores, e ja o resolve. O componente `Breakdown` (`dashboard.tsx:80`) renderiza rotulo a esquerda e valor a direita, uma linha por status:

```tsx
const Breakdown = ({ items }: { items: BreakdownItem[] }) => (
  <>
    <div className="border-t border-border/30 my-3" />
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', item.dotColor)} />
            {item.label}
          </span>
          <span className={cn('text-xs font-medium', item.color)}>{item.value}</span>
        </div>
      ))}
    </div>
  </>
)
```

**Ele e mais folgado que o layout da revisao 1 desta Spec**, porque usa o valor em `text-xs` e nao `text-sm`:

| | Revisao 1 (escrita a mao) | `Breakdown` do dashboard |
|---|---|---|
| Valor em 1024px | ~108px | **~92px** |
| Folga no interior de ~179px | ~15px | **~23px** |
| Ponto colorido no rotulo | nao | **sim** |

O ponto colorido tambem amarra visualmente o card de valores ao de contagens, que era a pendencia de consistencia registrada na revisao 1 e some por reuso.

**A renderizacao do componente NAO muda.** Nem `truncate`, nem `tabular-nums`, nem qualquer ajuste: o dashboard esta validado pela usuaria e a extracao nao pode alterar um pixel dele. As duas melhorias ficam registradas na secao 6 como opcionais.

## 5. Mudancas por arquivo

### 5.1 `src/components/shared/breakdown.tsx` - arquivo novo

Mover, **sem alterar**, a `interface BreakdownItem` (`dashboard.tsx:73` a `:78`) e o `const Breakdown` (`dashboard.tsx:80` a `:95`). Exportar os dois:

```ts
export type { BreakdownItem }
export { Breakdown }
```

Mais o import de `cn` de `@/lib/utils`.

### 5.2 `src/pages/dashboard.tsx` - passa a importar

Remover a `interface BreakdownItem` e o `const Breakdown` locais, e importar de `@/components/shared/breakdown`.

**Nenhuma outra linha muda.** As 2 chamadas existentes (`:293` e `:326`) continuam identicas. Se o `cn` ficar sem uso no arquivo, o lint acusa: conferir antes de remover o import, porque ele e usado em varios outros pontos.

### 5.3 `src/pages/deals.tsx` - usar nos DOIS breakdowns

**Atencao ao divisor.** O `Breakdown` ja renderiza o `<div className="border-t border-border/30 my-3" />` dentro dele. Os divisores que hoje existem soltos no `deals.tsx` (`:292` e `:336`, logo antes de cada breakdown) **precisam ser removidos**, senao a linha aparece em dobro.

```
Card "Total de Negocios" - DE (:292 a :315):
  <div className="border-t border-border/30 my-3" />
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    ... 3 blocos flex-col items-center com ponto inline no rotulo ...
  </div>

PARA:
  <Breakdown items={[
    { value: String(openDeals.length), color: 'text-yellow-500', dotColor: 'bg-yellow-500', label: 'Aberto' },
    { value: String(closedDeals.length), color: 'text-emerald-500', dotColor: 'bg-emerald-500', label: 'Fechado' },
    { value: String(lostDeals.length), color: 'text-red-500', dotColor: 'bg-red-500', label: 'Perdido' },
  ]} />
```

```
Card "Valor Total" - DE (:336 ao fim do bloco):
  <div className="border-t border-border/30 my-3" />
  <div className="space-y-1.5">        <- layout da revisao 1, sai inteiro
    ... 3 linhas escritas a mao ...
  </div>

PARA:
  <Breakdown items={[
    { value: fmt(openValue), color: 'text-yellow-500', dotColor: 'bg-yellow-500', label: 'Aberto' },
    { value: fmt(closedValue), color: 'text-emerald-500', dotColor: 'bg-emerald-500', label: 'Fechado' },
    { value: fmt(lostValue), color: 'text-red-500', dotColor: 'bg-red-500', label: 'Perdido' },
  ]} />
```

`BreakdownItem.value` e `string`, dai o `String(...)` nas contagens e o `fmt(...)` nos valores, exatamente como o dashboard faz.

Mais o import do `Breakdown`. Conferir se `cn` continua em uso no arquivo apos as remocoes.

## 6. Fora do escopo

- **O skeleton de carregamento (`:259`) nao muda.**
- **A renderizacao do `Breakdown` nao muda.** A extracao e mecanica.
- **O `fmt` continua duplicado** entre `dashboard.tsx:34` e `deals.tsx:41`, identicos. Deduplicar e outra passada.
- **Nada de `/inbox`, `supabase/`, `src/styles/`.**

### Pendencias registradas

| # | Pendencia | Onde |
|---|---|---|
| 1 | Cores de status hardcoded nas chamadas do `Breakdown`, contrariando a regra de tokens do `CLAUDE.md`. Agora centralizadas em um formato so, mas ainda hardcoded no call site | `dashboard.tsx`, `deals.tsx` |
| 2 | `truncate` no rotulo e `tabular-nums` no valor endureceriam o componente contra valores extremos e alinhariam os digitos. **Mudam a renderizacao do dashboard**, entao exigem decisao da usuaria | `shared/breakdown.tsx` |
| 3 | `fmt` duplicado em dois arquivos | `dashboard.tsx:34`, `deals.tsx:41` |

## 7. Verificacao

### 7.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida |
| 2 | `npm run build` | sem erro |
| 3 | `npm run lint` | 81 problems (67 errors, 14 warnings), identico ao baseline. **Reportar tambem se `dashboard.tsx` e `deals.tsx` aparecem na saida e com quais achados**, nao so o total |
| 4 | `git status` | 3 arquivos de codigo: o novo `shared/breakdown.tsx`, `dashboard.tsx` e `deals.tsx`, mais esta Spec. **O arquivo novo tem que entrar no `git add`** |

### 7.2 Manual

| # | Verificacao | Viewport |
|---|---|---|
| 5 | **O dashboard nao mudou em nada.** E o criterio mais importante: a extracao e mecanica e qualquer diferenca visual la e regressao | 1440px e 1024px |
| 6 | Os tres valores do `Valor Total` em `/deals` aparecem em linhas, sem encostar | 1336px |
| 7 | O mesmo em 1024px, que e o card mais estreito de todos | 1024px |
| 8 | Os dois cards de `/deals` (contagens e valores) agora tem o mesmo tratamento visual, com ponto colorido | 1440px |
| 9 | **O divisor aparece uma vez so** acima de cada breakdown, e nao em dobro | qualquer |
| 10 | Empilhado no mobile, sem estouro horizontal | 360px, 390px |
| 11 | Nos tres temas (light, dark, sand), nenhuma diferenca de cor ou superficie | 1440px |
