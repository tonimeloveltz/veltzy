# SPEC - Copiloto por Regras (Dashboard)

> Fase SDD: SPEC. Este documento e a especificacao de implementacao derivada de
> `PRD-copiloto.md`. NAO contem codigo de implementacao final; contem contratos,
> assinaturas exatas e o passo-a-passo de execucao.
>
> Fonte de verdade: `PRD-copiloto.md`. Decisoes travadas na revisao do PRD (aplicadas
> aqui, nao reabrir):
> - **Opcao A confirmada.** O card do Copiloto exibe SOMENTE as dicas calculadas no
>   cliente. `useNotifications` sai do card. Os alertas de tarefa vencida e reuniao em
>   breve saem do card de proposito (seguem no sino/notification-center, sem alteracao).
> - **Thresholds HERDADOS, sem mudanca:** 7 dias (proposta), 24h (lead quente), 3 dias
>   (negociacao), hoje (leads novos), sem threshold de tempo (aguardando retorno).
> - **Escopo:** SOMENTE as 5 regras portadas de `buildActions`. As regras candidatas 6, 7
>   e 8 do PRD ficam FORA desta fase. Nao implementar, nao deixar stub.
> - **Campo de tempo:** manter `updated_at` como as regras usam hoje, para preservar a
>   paridade de contagem com o card Proximas Acoes. (Ver nota de FOLLOW-UP na secao 6.)

---

## 0. Resumo executivo

Portar as 5 regras de `buildActions` (`next-actions-card.tsx`) para um builder puro
`buildCopilotTips` em `src/lib/copilot-tips.ts`, consumido pelo `copilot-card.tsx` via
`useMemo` sobre os hooks de dashboard ja existentes. Nenhuma query nova, nenhum toque no
banco, nenhuma IA. O card Proximas Acoes so e removido no ultimo passo, apos validacao de
paridade no browser.

---

## 1. Arquivos a CRIAR

### 1.1 `src/lib/copilot-tips.ts`

Builder puro (sem hooks, sem side effects), no estilo de `buildActiveDealInfo` /
`buildActions`. Concentra os helpers de tempo e a resolucao de stage por slug que hoje
vivem inline em `next-actions-card.tsx`, para que aquele arquivo possa ser removido no
passo final sem perder logica.

#### Interface `CopilotTip` (completa, todos os campos e tipos)

```ts
import type { LucideIcon } from 'lucide-react'

export type CopilotTipPriority = 'alta' | 'media' | 'baixa'

export interface CopilotTip {
  /** Identificador estavel da regra. Reusa as MESMAS keys de buildActions para
   *  facilitar a validacao de paridade regra a regra. */
  key: string
  /** Icone Lucide da dica (mesmo icone da regra correspondente em buildActions). */
  icon: LucideIcon
  /** Texto exibido, herdado 1:1 de buildActions (inclusive acentuacao). */
  label: string
  /** Contagem de leads que satisfazem a regra. A dica so entra na lista se count > 0. */
  count: number
  /** Prioridade para ordenacao e cor do icone. */
  priority: CopilotTipPriority
  /** Rota de navegacao completa, ja com o filtro (ex: '/pipeline?action=new_no_contact'). */
  navigateTo: string
}
```

> Nota de tipo: `LucideIcon` e o tipo canonico exportado por `lucide-react` para os
> componentes de icone. `buildActions` usa hoje `icon: typeof UserPlus`; ao mover para o
> builder, padronizar em `LucideIcon` (equivalente, porem nomeado). Sem `any`.

#### Constantes de threshold (nomeadas, no topo do arquivo)

```ts
/** Regra 2 — proposta parada ha 7+ dias (herdado de buildActions). */
export const PROPOSAL_STALE_DAYS = 7
/** Regra 3 — lead quente sem contato ha 24+ horas (herdado). */
export const HOT_STALE_HOURS = 24
/** Regra 4 — negociacao parada ha 3+ dias (herdado). */
export const NEGOTIATION_STALE_DAYS = 3
```

> Regra 1 (hoje) e Regra 5 (aguardando retorno) nao tem constante de tempo: a 1 usa dia
> civil (`isToday`) e a 5 nao tem threshold de tempo. Sem numeros magicos novos.

#### Helpers MOVIDOS de `next-actions-card.tsx` para ca

Copiar com comportamento identico (nao alterar semantica, para preservar paridade):

```ts
export const isToday = (dateStr: string): boolean => {
  const date = new Date(dateStr)
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

export const hoursAgo = (dateStr: string, hours: number): boolean => {
  const threshold = new Date()
  threshold.setHours(threshold.getHours() - hours)
  return new Date(dateStr) < threshold
}

export const daysAgo = (dateStr: string, days: number): boolean => {
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - days)
  return new Date(dateStr) < threshold
}

/** Resolucao de stage por slug (identica a getStageBySlug de buildActions). */
export const getStageBySlug = (
  stages: PipelineStage[],
  slug: string,
): PipelineStage | undefined => stages.find((s) => s.slug === slug)
```

> Exportar os helpers (`export`) para que `copilot-tips.test.ts` possa, se precisar,
> testa-los diretamente e para deixar explicito que sao a nova casa canonica desses
> utilitarios. `next-actions-card.tsx` continua com suas copias inline ate ser removido no
> passo final (nao refatorar o card antigo antes da remocao — ele sai inteiro).

#### Assinatura EXATA de `buildCopilotTips`

```ts
import type { LeadWithDetails, PipelineStage } from '@/types/database'
import type { ActiveDealInfo } from '@/lib/active-deal-info'

export const buildCopilotTips = (
  leads: LeadWithDetails[],
  stages: PipelineStage[],
  dealInfo: ActiveDealInfo,
): CopilotTip[] => { /* ... */ }
```

- Parametros na MESMA ordem e tipos de `buildActions(leads, stages, dealInfo)`.
- **NAO recebe `kpis`.** As regras 6/7/8 estao fora do escopo; nenhum parametro extra.
- Retorna `CopilotTip[]` ja filtrado (`count > 0`) e ordenado por prioridade.

#### Corpo (contrato, nao implementacao completa)

- `activeLeads = leads.filter((l) => dealInfo.activeLeadIds.has(l.id))` — identico ao card.
- `proposalStage = getStageBySlug(stages, 'proposta') ?? getStageBySlug(stages, 'proposal')`.
- `negotiationStage = getStageBySlug(stages, 'negociacao') ?? getStageBySlug(stages, 'negotiation')`.
- As 5 contagens sao calculadas com AS MESMAS condicoes de `buildActions` (ver tabela abaixo).
- Monta um array das 5 dicas (mesma ordem 1..5 do card), `.filter((t) => t.count > 0)` e
  entao aplica a ordenacao por prioridade (secao 1.1.1). Regras cujo stage nao existe
  contam 0 e caem no filtro (idem hoje).

##### Tabela das 5 regras (condicao e saida — herdadas 1:1)

| # | key | icon | priority | label | count (condicao sobre `activeLeads`) | navigateTo |
|---|-----|------|----------|-------|--------------------------------------|------------|
| 1 | `new-no-contact` | `UserPlus` | `media` | `Leads novos sem contato hoje` | `isToday(l.created_at) && l.conversation_status === 'unread'` | `/pipeline?action=new_no_contact` |
| 2 | `proposal-stale` | `FileText` | `media` | `Propostas vencendo esta semana` | `proposalStage && stageByLeadId.get(l.id) === proposalStage.id && daysAgo(l.updated_at, PROPOSAL_STALE_DAYS)` | `proposalStage ? '/pipeline?stage=' + proposalStage.id + '&stale=7' : ''` |
| 3 | `hot-no-contact` | `Flame` | `alta` | `Leads quentes sem contato há 24h` | `(l.temperature === 'fire' \|\| l.temperature === 'hot') && hoursAgo(l.updated_at, HOT_STALE_HOURS)` | `/pipeline?temperature=hot&stale=1` |
| 4 | `negotiation-stuck` | `AlertTriangle` | `alta` | `Negociações paradas há 3+ dias` | `negotiationStage && stageByLeadId.get(l.id) === negotiationStage.id && daysAgo(l.updated_at, NEGOTIATION_STALE_DAYS)` | `negotiationStage ? '/pipeline?stage=' + negotiationStage.id + '&stale=3' : ''` |
| 5 | `waiting-internal` | `Clock` | `baixa` | `Leads aguardando retorno` | `l.conversation_status === 'waiting_internal'` | `/pipeline?conversation_status=waiting_internal` |

> `label` copiado exatamente de `buildActions` (com acento). `navigateTo` = string
> `'/pipeline' + filter` onde `filter` e o mesmo de hoje. Para regras 2 e 4, quando o
> stage nao existe, o `filter` e `''` mas a contagem tambem e 0, entao a dica nao aparece
> (nunca renderiza um link vazio).

##### 1.1.1 Ordenacao por prioridade

Ordem final: **alta, depois media, depois baixa**. Em empate de prioridade, manter a ordem
natural das regras (1 -> 2 -> 3 -> 4 -> 5). Implementar de forma estavel (ex: `sort` por
peso de prioridade `{ alta: 0, media: 1, baixa: 2 }` sobre o array ja na ordem 1..5, com
`Array.prototype.sort` — estavel no runtime alvo — ou anexando o indice original como
desempate explicito para nao depender da estabilidade do engine).

Resultado esperado da ordem por prioridade das 5 regras portadas:
`hot-no-contact` (alta), `negotiation-stuck` (alta), `new-no-contact` (media),
`proposal-stale` (media), `waiting-internal` (baixa) — sempre respeitando que dicas com
`count === 0` ja sairam antes.

---

### 1.2 `src/lib/copilot-tips.test.ts`

Testes unitarios com `vitest` (mesma pratica de `active-deal-info.test.ts`: `describe/it/
expect`, factories `lead(...)`, `stage(...)`, `deal(...)` locais tipadas). O builder recebe
`ActiveDealInfo`; nos testes, montar via `buildActiveDealInfo(deals)` ou construir o
`ActiveDealInfo` a mao (Set + Map) — preferir `buildActiveDealInfo` para exercitar o
caminho real. Datas relativas a `new Date()` devem ser calculadas no proprio teste (ex:
`new Date(Date.now() - 25 * 3600_000).toISOString()`), nunca hardcoded, para os limites de
threshold nao quebrarem com o passar do tempo.

Casos de teste (um por linha):

1. Regra 1 (new-no-contact): DISPARA — lead ativo, `created_at` hoje, `conversation_status === 'unread'` => count 1.
2. Regra 1: NAO dispara — lead ativo, `created_at` de ontem (dia civil anterior), `unread` => count 0.
3. Regra 1: NAO dispara — lead ativo, `created_at` hoje, `conversation_status !== 'unread'` => count 0.
4. Regra 1: NAO dispara — lead NAO ativo (sem deal aberto), mesmo com created_at hoje + unread => count 0.
5. Regra 2 (proposal-stale): DISPARA — lead ativo no `proposalStage`, `updated_at` ha 8 dias => count 1.
6. Regra 2: limite exato — `updated_at` ha exatamente 7 dias (na fronteira `daysAgo(...,7)`) => NAO dispara (count 0), pois `daysAgo` usa `<` estrito.
7. Regra 2: DISPARA — `updated_at` ha 7 dias + 1 minuto (logo apos o limite) => count 1.
8. Regra 2: NAO dispara — lead ativo em stage diferente do proposalStage, ainda que velho => count 0.
9. Regra 2: pipeline SEM stage de proposta (nem `proposta` nem `proposal`) => count 0 e dica ausente.
10. Regra 2: stage resolvido pelo slug em ingles `proposal` (fallback) => DISPARA normalmente.
11. Regra 3 (hot-no-contact): DISPARA — lead ativo, `temperature === 'hot'`, `updated_at` ha 25h => count 1.
12. Regra 3: DISPARA — `temperature === 'fire'`, `updated_at` ha 25h => count 1.
13. Regra 3: limite exato — `temperature === 'hot'`, `updated_at` ha exatamente 24h => NAO dispara (count 0), `<` estrito.
14. Regra 3: NAO dispara — `temperature === 'warm'` (nao fire/hot), mesmo ha 25h => count 0.
15. Regra 4 (negotiation-stuck): DISPARA — lead ativo no `negotiationStage`, `updated_at` ha 4 dias => count 1.
16. Regra 4: limite exato — `updated_at` ha exatamente 3 dias => NAO dispara (count 0), `<` estrito.
17. Regra 4: pipeline SEM stage de negociacao (nem `negociacao` nem `negotiation`) => count 0 e dica ausente.
18. Regra 4: stage resolvido pelo slug em ingles `negotiation` (fallback) => DISPARA normalmente.
19. Regra 5 (waiting-internal): DISPARA — lead ativo, `conversation_status === 'waiting_internal'` => count 1 (sem dependencia de tempo).
20. Regra 5: NAO dispara — lead ativo com outro `conversation_status` => count 0.
21. Regra 5: NAO dispara — lead com `waiting_internal` mas NAO ativo (sem deal aberto) => count 0.
22. Lista vazia: `leads` vazio => retorna `[]`.
23. Lista vazia: nenhuma regra satisfeita (todos count 0) => retorna `[]` (nenhuma dica com count 0 vaza).
24. Contagem agregada: multiplos leads satisfazendo a MESMA regra => count reflete o total (ex: 3 leads unread hoje => count 3).
25. Ordenacao por prioridade: cenario com as 5 regras disparando => ordem retornada e `hot-no-contact`, `negotiation-stuck`, `new-no-contact`, `proposal-stale`, `waiting-internal`.
26. Ordenacao — empate: apenas as duas regras `alta` (3 e 4) disparando => ordem preserva regra 3 antes da regra 4 (desempate pela ordem natural).
27. `navigateTo` das regras 2 e 4: quando o stage existe, a rota contem o `stage=<id>` correto; regras de stage inexistente ja saem pelo filtro (coberto por 9 e 17).

---

## 2. Arquivos a MODIFICAR

### 2.1 `src/components/dashboard/copilot-card.tsx`

**Objetivo:** trocar a fonte de dados de `useNotifications` para as dicas calculadas,
mantendo o visual do card (icone `Bot`, titulo "Copiloto").

**Nova prop:**

```ts
const CopilotCard = ({ pipelineId }: { pipelineId?: string | null }) => { /* ... */ }
```

Tipo exato: `pipelineId?: string | null` (identico a `NextActionsCard`, `BottleneckDetector`,
`ForecastCard`).

**Hooks consumidos (substituem `useNotifications`):**

```ts
import { useDashboardLeads } from '@/hooks/use-dashboard-leads'
import { useDashboardStages } from '@/hooks/use-dashboard-stages'
import { useDashboardDeals } from '@/hooks/use-deals'
import { buildActiveDealInfo } from '@/lib/active-deal-info'
import { buildCopilotTips } from '@/lib/copilot-tips'

const { data: leads, isLoading: leadsLoading } = useDashboardLeads(pipelineId)
const { data: stages, isLoading: stagesLoading } = useDashboardStages(pipelineId)
const { data: deals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)
```

> NAO passar `useDashboardKpis` — regra 8 esta fora do escopo.

**`useMemo` (identico em forma ao de `NextActionsCard`):**

```ts
const tips = useMemo(() => {
  if (!leads || !stages || !deals) return []
  return buildCopilotTips(leads, stages, buildActiveDealInfo(deals))
}, [leads, stages, deals])

const isLoading = leadsLoading || stagesLoading || dealsLoading
```

**Remocoes obrigatorias:**
- Remover `import { useNotifications } from '@/hooks/use-notifications'`.
- Remover `import type { Notification } from '@/types/database'`.
- Remover `import { timeAgo } from '@/lib/time'` (nao ha mais `created_at` de notificacao).
- Remover a chamada `useNotifications()` e a derivacao `copilotAlerts`.
- Remover o componente auxiliar `PriorityIcon` baseado em titulo de notificacao (a cor do
  icone passa a vir de `tip.priority`).

**Render (novo conteudo, visual preservado):**
- Cabecalho mantido: `div` com `Bot` em `bg-purple-500/15` + `<h3>Copiloto</h3>`.
- **Loading:** enquanto `isLoading`, exibir skeleton no mesmo estilo dos outros cards de
  inteligencia (ex: 3x `<Skeleton className="h-10 w-full rounded-lg" />` dentro de
  `space-y-2`, usando `@/components/ui/skeleton`). O card antigo nao tinha loading; agora
  tem, para paridade com os demais.
- **Estado vazio** (`tips.length === 0` e nao loading): manter o bloco com
  `CheckCircle2` verde e a mensagem **"Tudo em dia"** (texto novo definido no PRD secao 4;
  substitui "Nenhum alerta do copiloto. Tudo em ordem.").
- **Lista:** `tips.map((tip) => ...)`, cada item um `<button key={tip.key}>` que faz
  `navigate(tip.navigateTo)`. Renderizar `tip.icon` (componente Lucide) com cor derivada de
  `tip.priority` (alta = vermelho, media = azul/laranja, baixa = neutro), `tip.label` e um
  badge com `tip.count` (mesmo padrao tabular-nums dos outros cards). Manter as classes de
  container roxo do card atual (`bg-purple-500/5`, `border-purple-500/10`, hover) para o
  Copiloto continuar visualmente distinto de Proximas Acoes.

> Nota: a cor por prioridade pode ser um pequeno mapa local
> `{ alta: 'text-red-500', media: 'text-blue-500', baixa: 'text-muted-foreground' }`
> aplicado ao icone — sem cores hardcoded fora de tokens semanticos onde houver token
> equivalente (seguir o padrao ja usado em `next-actions-card.tsx`, que usa `text-red-500`
> etc. nos badges).

**O que NAO muda:** o card continua sendo um componente de apresentacao fino; toda a logica
de regra vive em `buildCopilotTips`. Sem `any`.

### 2.2 `src/pages/dashboard.tsx`

- Linha ~344: trocar `<CopilotCard />` por `<CopilotCard pipelineId={selectedPipelineId} />`.
- **NAO** remover `NextActionsCard` (import na linha ~21, uso na linha ~338) NESTE momento.
  Ambos os cards coexistem durante a validacao de paridade. A remocao e o passo final
  (secao 3, item 6), so apos a paridade confirmada no browser.

---

## 3. Ordem de implementacao (respeitando dependencias)

1. **Criar `src/lib/copilot-tips.ts`**: constantes de threshold, helpers movidos
   (`isToday`/`hoursAgo`/`daysAgo`/`getStageBySlug`), interface `CopilotTip`, tipo
   `CopilotTipPriority`, e o builder puro `buildCopilotTips` com as 5 regras + ordenacao.
2. **Criar `src/lib/copilot-tips.test.ts`** e rodar `npx vitest run copilot-tips` ate os 27
   casos passarem. (Nada de UI depende disso ainda; e a rede de seguranca da paridade.)
3. **Modificar `copilot-card.tsx`**: adicionar prop `pipelineId`, consumir os 3 hooks,
   `useMemo` do builder, loading/skeleton, estado vazio "Tudo em dia", render das dicas.
   Remover `useNotifications`, `PriorityIcon`, `timeAgo` e o import de `Notification`.
4. **Modificar `dashboard.tsx`**: passar `pipelineId={selectedPipelineId}` ao `<CopilotCard />`.
   NextActionsCard permanece montado.
5. **Validar no browser** (secao 4). Rodar tambem `npm run lint` e `npm run build`.
   So avancar quando a paridade das 5 regras estiver confirmada regra a regra.
6. **Ultimo passo, SOMENTE apos a validacao de paridade no browser:**
   - Remover de `dashboard.tsx` o import de `NextActionsCard` (linha ~21) e o uso (linha ~338).
   - Deletar `src/components/dashboard/next-actions-card.tsx`.
   - Confirmar que `buildActiveDealInfo`, `useDashboardLeads`, `useDashboardStages`,
     `useDashboardDeals` seguem usados por outros cards (Bottleneck/Forecast/Copiloto) e
     **NAO** devem ser removidos.
   - Rodar `npm run lint` e `npm run build` novamente apos a remocao.

> A remocao dos helpers inline de `next-actions-card.tsx` acontece "de graca" ao deletar o
> arquivo inteiro no passo 6 — nao refatorar o card antigo antes disso.

---

## 4. Validacao de paridade (antes de remover Proximas Acoes)

Com os DOIS cards visiveis na Dashboard (Copiloto ja com dicas + Proximas Acoes ainda
presente), para o **mesmo pipeline selecionado e o mesmo periodo**, comparar as contagens
regra a regra. Como ambos consomem `useDashboardLeads/Stages/Deals` com o mesmo
`pipelineId` e usam a MESMA logica (`buildActiveDealInfo` + mesmas condicoes/thresholds), as
contagens devem ser identicas.

Procedimento, uma regra por vez:

1. **Leads novos sem contato hoje** — comparar o badge de `new-no-contact` no Copiloto com o
   item "Leads novos sem contato hoje" em Proximas Acoes. Devem exibir o MESMO numero.
2. **Propostas vencendo esta semana** — `proposal-stale` vs "Propostas vencendo esta semana".
   Mesmo numero. Se o pipeline nao tiver stage de proposta, AMBOS devem omitir a dica.
3. **Leads quentes sem contato ha 24h** — `hot-no-contact` vs "Leads quentes sem contato há 24h".
   Mesmo numero.
4. **Negociacoes paradas 3+ dias** — `negotiation-stuck` vs "Negociações paradas há 3+ dias".
   Mesmo numero. Sem stage de negociacao => ambos omitem.
5. **Leads aguardando retorno** — `waiting-internal` vs "Leads aguardando retorno". Mesmo numero.

Criterios adicionais:
- Uma dica que aparece num card e nao no outro (para a mesma regra e mesmo filtro) e uma
  FALHA de paridade — investigar antes de prosseguir.
- Trocar o filtro de pipeline e repetir a comparacao das 5 regras em pelo menos 2 pipelines
  diferentes (idealmente um com stages `proposta`/`negociacao` e um sem, para exercitar a
  omissao).
- **Rede:** abrir a aba Network e confirmar que o card Copiloto NAO dispara nenhuma
  requisicao nova — ele reusa os dados ja buscados pelos hooks de dashboard.
- Diferenca esperada e aceitavel: a ORDEM dos itens (Copiloto ordena por prioridade;
  Proximas Acoes usa ordem fixa 1..5). Paridade e sobre CONTAGEM por regra, nao sobre ordem.

Só apos as 5 contagens baterem em todos os pipelines testados, executar o passo 6 da secao 3.

---

## 5. O que NAO entra nesta fase

- **Banco de dados:** nao ha migration, nao ha SQL, nao ha politica/alteracao de RLS, nao ha
  mudanca de schema, nao ha coluna nova, nao ha query nova. **Nao se aplica nesta fase.**
- **Edge Function `ai-copilot`:** nao alterar (nem o modo batch, nem o `sales-pulse`).
- **`useSalesPulse` / `use-sales-pulse.ts`:** continua codigo morto; nao ligar, nao remover.
- **`use-notifications.ts`, `notifications.service.ts`, `notifications.store.ts`:** nao mexer.
  O sino/notification-center segue usando `useNotifications` normalmente.
- **Regras candidatas 6, 7 e 8 do PRD:** FORA do escopo. Nao implementar, nao deixar stub,
  nao passar `kpis` para o builder.
- **Opcao C (combinar dicas + notificacoes numa lista):** follow-up, fora desta fase.
- **IA:** nenhuma chamada a LLM; tudo calculado no cliente.

## 6. Notas de FOLLOW-UP (fora desta fase, registradas para depois)

- **Campo de tempo `updated_at`:** as regras 2, 3 e 4 usam `updated_at` do lead, herdado de
  `buildActions`, para preservar a paridade de contagem com Proximas Acoes. Porem
  `updated_at` muda em QUALQUER alteracao do lead (nao so em contato do cliente), entao o
  campo semanticamente correto para "sem contato ha X" seria `last_customer_message_at`.
  Trocar o campo mudaria as contagens e quebraria a paridade — por isso fica FORA desta
  fase. Tratar em tarefa separada, apos a remocao do card Proximas Acoes.
- **Opcao C** (dicas + notificacoes numa lista unica, com deduplicacao por lead/categoria)
  fica registrada como evolucao possivel; ver PRD secao 3 para o risco de duplicata.

## 7. Secoes de template que nao se aplicam

- **Migration / SQL / RLS / schema:** nao se aplica nesta fase.
- **Edge Functions / backend:** nao se aplica nesta fase.
- **LGPD:** sem coleta de dado novo, sem campo/coluna/tabela, sem transferencia a terceiro.
  Apenas nova apresentacao, no cliente, de dados que o usuario logado ja acessa (ver PRD
  secao 7). Nenhuma base legal nova necessaria.
</content>
</invoke>
