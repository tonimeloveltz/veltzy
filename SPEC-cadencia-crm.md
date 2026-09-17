# SPEC - Cadência de contato com leads (inbox)

> Fase 2 do SDD: SPEC. Nenhum código de aplicação foi escrito ou alterado.
> Base: `PRD-cadencia-crm.md` (raiz), com as correções A e B aplicadas.

**Repo:** Veltzy CRM (React 19 + Vite + TS + Tailwind/shadcn, React Query v5 +
Zustand, Supabase schema `veltzy`). **Dev e develop apontam para o staging**
(`hfebvugdsztnzgpybdwj`), conforme `docs/AMBIENTES.md`; produção
(`zxefzegggntfjlfsdgvw`) é read-only em desenvolvimento.

---

## 0. Ponto de partida: o schema já existe

`veltzy.lead_contact_events` **já foi criada e aplicada no staging** pela
migration do Hub `supabase/migrations/20260916132336_lead_contact_events.sql`.
Nada de schema nasce neste repo.

```sql
CREATE TABLE veltzy.lead_contact_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES veltzy.leads(id)     ON DELETE CASCADE,
  registered_by UUID          REFERENCES public.profiles(id)  ON DELETE SET NULL,
  contacted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS ligada, três policies (`select`, `insert`, `delete`), predicado
`company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin()`.
`GRANT SELECT, INSERT, DELETE` para `authenticated`.

**Consequências que valem para toda a Spec:**

- **UPDATE é negado no banco de propósito.** Não há policy de UPDATE nem GRANT
  de UPDATE. Um `.update()` nesta tabela não retorna erro de permissão útil: a
  RLS simplesmente não casa nenhuma linha e o update "passa" afetando zero
  linhas. Ou seja, **a falha seria silenciosa**. Por isso a regra é dura:
  **nenhum service, hook ou componente desta feature emite `.update()` em
  `lead_contact_events`, em nenhuma hipótese.** Corrigir = `DELETE` + `INSERT`.
- **Sem coluna `note`.** Nenhum campo de texto livre nesta fase.
- **Sem `updated_at`**, logo sem trigger `set_updated_at`.
- `registered_by` é `public.profiles.id`, **não** `auth.uid()`. A origem no
  frontend é `useAuthStore((s) => s.profile?.id)`.

### Decisões fechadas (não reabrir)

1. Aviso: faixa inline no `ChatWindow`, entre `MessageList` e `ChatInput`.
2. Dispensa: `localStorage`, chave `veltzy:cadence-dismissed:<leadId>:<YYYY-MM-DD em SP>`.
3. Tabela: `lead_contact_events`.
4. Sem coluna `note`.
5. Remoção de evento: autorização só na aplicação. Qualquer membro da empresa
   remove. **RF-10 entra nesta fase.**
6. Evento imutável: nunca gerar UPDATE.

### Correções ao PRD incorporadas aqui

**A. Gatilho do aviso simplificado.** O aviso aparece quando:

> envio humano **bem-sucedido** **E** não há contato registrado hoje para o lead
> **E** o aviso não foi dispensado nem registrado hoje para o lead.

**Não** se conta mensagens humanas do dia no cache dentro do `onSuccess`. A
mensagem real pode ainda não estar no cache naquele instante (o insert otimista
está lá, a linha do servidor chega por invalidate/realtime depois), e contar ali
é corrida garantida. A condição "não há contato hoje" somada ao dedupe diário já
entrega um aviso por lead por dia, que é o que "primeira mensagem do dia"
significa na prática. O que morre com isso: se o vendedor registrar contato
manualmente às 9h e só mandar mensagem às 15h, não há aviso. Correto, porque já
existe contato hoje.

**B. queryKey da cadência é `['cadence', companyId, leadId]`** em todo lugar:
hook, invalidação e `fetchQuery` do gatilho. Sem variação.

---

## 1. Arquivos a CRIAR

### 1.1 `src/lib/contact-cadence.ts`

Lógica pura. **Sem React, sem Supabase, sem `localStorage`, sem `Date.now()`
implícito** (todo "agora" entra por parâmetro com default). É o que torna o
arquivo testável em `contact-cadence.test.ts` sem mock de ambiente.

Molde: `src/lib/current-month.ts` (mesma técnica de `Intl` com timezone
explícita).

**Exporta:**

```ts
export const SP_TZ = 'America/Sao_Paulo'

export interface CadenceTimelineEntry {
  id: string
  contactedAt: string      // ISO, como veio do banco
  dayKey: string           // 'YYYY-MM-DD' em SP
  dPlus: number            // dias desde o PRIMEIRO contato
  registeredBy: string | null
}

export const spDateKey = (date: Date | string): string
export const daysBetweenSpDates = (fromKey: string, toKey: string): number
export const buildCadenceTimeline = (events: LeadContactEvent[]): CadenceTimelineEntry[]
export const lastContactLabel = (events: LeadContactEvent[], now?: Date): string | null
export const hasContactToday = (events: LeadContactEvent[], now?: Date): boolean
```

Contratos, um a um:

**`spDateKey(date)`** → `'YYYY-MM-DD'` do instante **no fuso de São Paulo**.
Aceita `Date` ou string ISO. Usa `Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ })`,
que já emite `YYYY-MM-DD` ordenável, exatamente como `spYearMonth` faz para
ano-mês em `current-month.ts`.

**`daysBetweenSpDates(fromKey, toKey)`** → inteiro de dias-calendário,
`toKey - fromKey`. Negativo se `toKey` for anterior. Contrato **não óbvio**: as
chaves devem ser reinterpretadas em **UTC**, nunca com `new Date('2026-10-01')`
sem cuidado nem com `getTimezoneOffset`. Subtrair dois `Date` construídos em
horário local erra em 1 dia quando cai numa virada de DST.

```ts
// As chaves ja sao dias de calendario em SP. Para contar a diferenca entre
// elas, tratar cada uma como meia-noite UTC: dois instantes sem fuso, so
// numeros. Assim a subtracao e sempre multiplo exato de 86400000, e nenhuma
// mudanca de horario de verao entra na conta.
const MS_PER_DAY = 86_400_000
export const daysBetweenSpDates = (fromKey: string, toKey: string): number => {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY)
}
```

**`buildCadenceTimeline(events)`** → entradas prontas para render.

- **Não confia na ordem recebida.** Ordena internamente por `contacted_at`
  crescente para achar o primeiro contato, e **devolve em ordem decrescente**
  (mais recente primeiro), que é a ordem de exibição.
- `dPlus` de cada entrada = `daysBetweenSpDates(dayKey(primeiro), dayKey(entrada))`.
  O primeiro contato é sempre `dPlus: 0`.
- Dois eventos no mesmo dia-calendário têm o **mesmo** `dPlus` (RF-04). O selo
  mede dias desde o primeiro contato, não posição na lista.
- Lista vazia → `[]`.

**`lastContactLabel(events, now = new Date())`** → string pronta, ou `null`
quando não há evento. Baseada no **último** contato:

| `daysBetweenSpDates(dayKey(último), dayKey(now))` | Retorno |
|---|---|
| `0` | `'Ultimo contato hoje'` |
| `1` | `'Ultimo contato ontem'` |
| `>= 2` | `` `Ultimo contato ha ${n} dias` `` |
| lista vazia | `null` |

Um valor negativo (evento com `contacted_at` no futuro, que o banco não impede)
cai no caso `0` por clamp: `Math.max(0, n)`. Não vale ter "há -1 dias" na tela.

**`hasContactToday(events, now = new Date())`** → `true` se algum evento tem
`spDateKey(contacted_at) === spDateKey(now)`. É a condição central do gatilho do
aviso.

**Nota de copy:** as strings acima vão **sem acento**, seguindo o padrão já
estabelecido na vizinhança (`contact-panel.tsx` usa "Observacoes", "Negocios",
"Responsavel"; `lead-deals-panel.tsx` usa "Nenhum negocio"). Mantém a inbox
coerente. Se a preferência for acentuar, é trocar nesta função e nos dois
componentes, e vale trocar no resto da inbox junto.

---

### 1.2 `src/lib/contact-cadence.test.ts`

Vitest. Molde: `src/components/inbox/contact-panel.test.ts` e os testes irmãos
de `src/lib/`. Casos em §4.

---

### 1.3 `src/lib/cadence-dismissal.ts`

Separado de `contact-cadence.ts` **de propósito**: toca `localStorage`, então não
é puro e não deve contaminar o módulo de cálculo.

**Exporta:**

```ts
export const dismissalKey = (leadId: string, now?: Date): string
export const isDismissedToday = (leadId: string, now?: Date): boolean
export const markDismissedToday = (leadId: string, now?: Date): void
```

- `dismissalKey` monta `veltzy:cadence-dismissed:<leadId>:<spDateKey(now)>`.
- **Toda leitura e escrita dentro de `try/catch`.** `localStorage` lança em
  janela anônima, com cookies de terceiros bloqueados ou com storage cheio. Se
  falhar, `isDismissedToday` retorna `false` e `markDismissedToday` é no-op: o
  pior caso vira "o aviso reaparece", nunca "a inbox quebra".
- **Sem rotina de limpeza.** As chaves são datadas e param de casar sozinhas no
  dia seguinte. São dezenas de bytes por lead por dia; varrer o storage para
  apagá-las custaria mais do que deixá-las.

---

### 1.4 `src/services/lead-contact-events.service.ts`

Camada de dados. Funções puras sobre `veltzy()`, sem hooks, sem estado, sem UI.
Molde: `src/services/tasks.service.ts`.

**Exporta:**

```ts
export interface CreateContactEventPayload {
  leadId: string
  registeredBy: string | null
}

export const getContactEvents = (companyId: string, leadId: string): Promise<LeadContactEvent[]>
export const createContactEvent = (companyId: string, payload: CreateContactEventPayload): Promise<LeadContactEvent>
export const deleteContactEvent = (companyId: string, eventId: string): Promise<void>
```

Contratos:

- **Toda query filtra `company_id` no código**, além da RLS. Regra de ouro do
  CLAUDE.md: RLS é a última linha de defesa, não a única.
- `getContactEvents` ordena `.order('contacted_at', { ascending: false })`, que
  casa com o índice `idx_lead_contact_events_lead (lead_id, contacted_at DESC)`.
  Ainda assim `buildCadenceTimeline` reordena por conta própria: a ordem da query
  é otimização, não contrato.
- `createContactEvent` **não envia `contacted_at`**. Deixa o `DEFAULT NOW()` do
  banco resolver, para que o instante seja o do servidor e não o relógio do
  vendedor. Envia `company_id`, `lead_id`, `registered_by`. Usa
  `.select().single()` e devolve a linha.
- `deleteContactEvent` filtra `.eq('id', eventId).eq('company_id', companyId)`.
- **Nenhuma função de update.** Não existe `updateContactEvent` nesta Spec, e
  não deve passar a existir (ver §0).
- **Nenhuma destas funções toca `veltzy.leads`.**

---

### 1.5 `src/hooks/use-lead-cadence.ts`

React Query v5. Molde: `src/hooks/use-deals.ts` e `use-tasks.ts`.

**Exporta:**

```ts
export const cadenceQueryKey = (companyId: string | undefined, leadId: string | null) =>
  ['cadence', companyId, leadId] as const

export const useLeadCadence = (leadId: string | null)  // UseQueryResult<LeadContactEvent[]>
export const useCreateContactEvent = ()                 // mutate({ leadId })
export const useDeleteContactEvent = ()                 // mutate({ eventId, leadId })
```

Contratos:

- `cadenceQueryKey` é o **ponto único** da chave `['cadence', companyId, leadId]`
  (correção B). Hook, invalidações e o `fetchQuery` do gatilho importam daqui.
  Chave montada à mão em qualquer um dos três vira cache órfão: a query existe,
  a invalidação não a alcança, e a linha do tempo fica velha sem erro nenhum.
- `useLeadCadence`: `enabled: !!companyId && !!leadId`, `staleTime: 30_000`
  (mesmo valor de `useDealsByLead` e `useLeadTasks`).
- `useCreateContactEvent`: `registered_by` sai de
  `useAuthStore((s) => s.profile?.id) ?? null` **dentro do hook**, não do
  componente. `onSuccess` invalida `cadenceQueryKey(companyId, leadId)`.
  `onError` → `toast.error('Erro ao registrar contato')`.
- **`useDeleteContactEvent` recebe `leadId` junto com `eventId`.** Contrato não
  óbvio: o service só precisa do `eventId`, mas sem o `leadId` a mutation não tem
  como montar a chave para invalidar, e a linha do tempo fica na tela depois de
  apagada. `onError` → `toast.error('Erro ao remover contato')`.
- **Nenhum hook aqui emite UPDATE.**
- Sem update otimista nas mutations. São ações de um clique com resposta rápida,
  e a tabela não tem conflito de escrita (INSERT não colide). O ganho não paga a
  complexidade de rollback.

---

### 1.6 `src/components/inbox/lead-cadence-panel.tsx`

Seção "Cadencia (N)" do painel Contato. Molde: `lead-deals-panel.tsx`
(colapsável, contador no título, `AlertDialog` de confirmação).

```ts
interface LeadCadencePanelProps {
  leadId: string
}
```

Exporta `{ LeadCadencePanel }` (named export, padrão do diretório).

Estrutura:

- Cabeçalho colapsável: ícone (`CalendarCheck` ou `History` do lucide) +
  `Cadencia ({total})` + chevron. `expanded` em `useState(true)`, como no
  `LeadDealsPanel`.
- Resumo: `lastContactLabel(events)` em `text-[11px] text-muted-foreground`.
  Omitido quando `null`.
- Botão **"Registrar contato"** (`Button size="sm" variant="outline"`, largura
  total), `disabled` enquanto `createContactEvent.isPending`.
- Linha do tempo: `buildCadenceTimeline(events)` renderizada na ordem devolvida
  (mais recente primeiro). Cada entrada: data `dd/MM/yyyy` via
  `toLocaleDateString('pt-BR')`, o selo **D+N**, e um botão de remover que
  aparece no hover (`opacity-0 group-hover:opacity-100`, como no
  `LeadDealsPanel`).
- Estado vazio: `Nenhum contato registrado`, `text-[10px] text-muted-foreground/60`.
- `AlertDialog` de confirmação da remoção (RF-10).

**Selo D+N:** `<span>` com tokens, **não** componente novo. Não existe
`src/components/ui/badge.tsx` neste projeto; os selos existentes são spans (ver
o selo de score em `contact-panel.tsx` e `lead-source-badge.tsx`). Classe:
`inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground`.
Cores só por token semântico, nunca `bg-blue-500`.

**Não renderiza `null` quando a lista está vazia.** Diferente do
`LeadDealsPanel`, que some sem deals: aqui o estado vazio **é** a chamada para a
ação. Sumir esconderia o botão de registrar, que é a feature.

---

### 1.7 `src/components/inbox/cadence-nudge-bar.tsx`

A faixa do aviso. Molde visual: o banner "WhatsApp desconectado" em
`chat-window.tsx:37` (mesma faixa horizontal, `border-b`, ícone + texto + ações).
Tom informativo, não destrutivo: `bg-primary/5`, `text-foreground`, ícone
`CalendarPlus`.

```ts
interface CadenceNudgeBarProps {
  leadId: string
}
```

Exporta `{ CadenceNudgeBar }`.

Copy: `Primeira mensagem do dia para este contato. Registrar um contato?`
Botões: **Registrar** (`Button size="sm"`) e **Agora nao**
(`Button size="sm" variant="ghost"`).

**Contrato do gatilho (a parte não óbvia da feature):**

```ts
// O store so publica "houve envio para o lead X". Quem decide se a faixa
// aparece e este componente, porque a decisao e assincrona (precisa da cadencia
// do lead) e o hook de mensagens nao pode carregar isso.
useEffect(() => {
  if (nudgeLeadId !== leadId || !companyId) return

  let cancelled = false
  const decide = async () => {
    // 1. Dispensado ou ja resolvido hoje neste navegador? Barra antes de
    //    qualquer ida a rede.
    if (isDismissedToday(leadId)) return
    // 2. Ja existe contato registrado hoje? fetchQuery reaproveita o cache se
    //    estiver fresco; so vai ao banco se nao estiver.
    const events = await queryClient.fetchQuery({
      queryKey: cadenceQueryKey(companyId, leadId),
      queryFn: () => getContactEvents(companyId, leadId),
    })
    if (cancelled || hasContactToday(events)) return
    setVisible(true)
  }

  decide().finally(() => {
    // SEMPRE limpa, tenha a faixa aparecido ou nao. Sem isso, o proximo envio
    // para o MESMO lead nao muda o valor no store, o efeito nao roda de novo, e
    // o aviso nunca mais aparece naquela sessao.
    if (!cancelled) clearCadenceNudge()
  })

  return () => { cancelled = true }
}, [nudgeLeadId, leadId, companyId])
```

Resto do comportamento:

- **Registrar:** `createContactEvent.mutate({ leadId })`, `setVisible(false)`.
  **Não** grava no `localStorage`: o evento de hoje já barra o aviso pela
  condição `hasContactToday`, em qualquer navegador e qualquer dispositivo.
  Gravar a dispensa aqui seria um segundo mecanismo dizendo a mesma coisa, que é
  onde nascem divergências.
- **Agora nao:** `markDismissedToday(leadId)`, `setVisible(false)`, **nenhuma
  escrita no banco** (RF-15).
- **Troca de lead:** `useEffect(() => setVisible(false), [leadId])`. A faixa
  pertence à conversa que estava aberta; carregá-la para outro lead seria pedir
  registro do contato errado.
- **Sem lead selecionado / faixa invisível:** retorna `null`.
- Não some sozinha. Só sai por um dos dois botões ou por troca de lead.

---

## 2. Arquivos a MODIFICAR

### 2.1 `src/types/database.ts`

Arquivo **escrito à mão**, não gerado por `supabase gen types`. Adicionar perto
das interfaces de domínio de lead (após `LeadWithLastMessage`, por volta da
linha 446):

```ts
/**
 * Evento de contato manual com um lead (veltzy.lead_contact_events).
 *
 * IMUTAVEL: a tabela nao tem policy nem GRANT de UPDATE, e nao tem updated_at.
 * Corrigir um registro e apagar e registrar de novo. Nunca emitir .update().
 *
 * `registered_by` e public.profiles.id (NAO auth.uid()), com ON DELETE SET NULL:
 * vendedor que sai da empresa nao apaga o historico do lead.
 */
export interface LeadContactEvent {
  id: string
  company_id: string
  lead_id: string
  registered_by: string | null
  contacted_at: string
  created_at: string
}
```

Espelha o schema aplicado, campo a campo, sem extras. O TypeScript não checa
isso contra o banco: se a tabela mudar no Hub, este tipo mente em silêncio.

---

### 2.2 `src/stores/inbox.store.ts`

Dois campos e duas ações em `InboxState`:

```ts
  /** Lead que acabou de receber envio humano. O CadenceNudgeBar decide se mostra. */
  cadenceNudgeLeadId: string | null
  requestCadenceNudge: (leadId: string) => void
  clearCadenceNudge: () => void
```

No `create`:

```ts
  cadenceNudgeLeadId: null,
  requestCadenceNudge: (leadId) => set({ cadenceNudgeLeadId: leadId }),
  clearCadenceNudge: () => set({ cadenceNudgeLeadId: null }),
```

Nada mais no store muda. `filters`, `unreadCount` e `contactPanelOpen` ficam
como estão.

---

### 2.3 `src/hooks/use-messages.ts`

Único ponto de gancho do envio. Os três caminhos (texto em `chat-input.tsx:110`,
anexo em `chat-input.tsx:127`, áudio em `audio-recorder.tsx:141`) passam por esta
mesma mutation, então uma mudança cobre os três.

Em `useSendMessage`, dentro do `onSuccess` **já existente**, acrescentar ao final:

```ts
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      // Cadencia: publica so a intencao. Quem decide se a faixa aparece e o
      // CadenceNudgeBar, que precisa de dado assincrono (a cadencia do lead) e
      // nao cabe aqui. getState() em vez de hook: o callback nao deve assinar o
      // store e re-renderizar todo mundo que usa useSendMessage.
      if (data?.delivery_status !== 'failed') {
        useInboxStore.getState().requestCadenceNudge(variables.leadId)
      }
    },
```

Import novo: `import { useInboxStore } from '@/stores/inbox.store'`.

Contratos:

- **Nada de contagem de mensagens do dia aqui** (correção A). O `onSuccess`
  dispara antes da linha real do servidor chegar ao cache; contar ali é corrida.
- A guarda `delivery_status !== 'failed'` cobre RF-19 para o caso em que a edge
  function devolve `200` com a linha marcada como falha em vez de lançar. Erro
  lançado já cai em `onError` e nem chega aqui.
- **Mensagem da IA SDR não passa por esta mutation** (é gravada pelo backend), o
  que atende RF-18 sem código nenhum.
- `onMutate` e `onError` ficam **intocados**.

---

### 2.4 `src/components/inbox/contact-panel.tsx`

**Uma linha de render e um import.** O arquivo já tem 510 linhas, bem acima do
teto de ~200 do CLAUDE.md; nenhuma lógica de cadência entra aqui.

Entre `<LeadDealsPanel ... />` e o bloco de Observações:

```tsx
        {/* Deals */}
        <LeadDealsPanel leadId={lead.id} leadName={lead.name} />

        {/* Cadencia */}
        <LeadCadencePanel leadId={lead.id} />

        {/* Observations - auto-save */}
```

Import: `import { LeadCadencePanel } from '@/components/inbox/lead-cadence-panel'`.

Nenhum outro trecho muda: o auto-save de observações, o flush de campos e os
`useEffect` de troca de lead ficam exatamente como estão.

---

### 2.5 `src/components/inbox/chat-window.tsx`

Uma linha de render e um import, entre `MessageList` e `ChatInput`:

```tsx
      <MessageList
        messages={messages ?? []}
        isLoading={isLoading}
        isTyping={isTyping}
      />

      <CadenceNudgeBar leadId={lead.id} />

      <ChatInput leadId={lead.id} onTyping={sendTyping} />
```

Import: `import { CadenceNudgeBar } from '@/components/inbox/cadence-nudge-bar'`.

A posição importa: **fora** do `MessageList`, para não rolar junto com as
mensagens, e **acima** do `ChatInput`, no campo de visão de quem acabou de
apertar Enter. E independe do painel Contato estar aberto, que abaixo de `xl`
está fechado por padrão.

---

### 2.6 Arquivos que **não** mudam

`chat-input.tsx`, `audio-recorder.tsx`, `messages.service.ts`, `leads.service.ts`,
`use-leads.ts`, `conversation-list.tsx`, `inbox.tsx`. O gancho na mutation
compartilhada dispensa tocar em qualquer um deles.

---

## 3. Regras de cálculo, consolidadas

Seja `E = [e1..en]` os eventos do lead ordenados por `contacted_at` crescente, e
`dia(x) = spDateKey(x)` em **America/Sao_Paulo**.

| Regra | Fórmula | Função |
|---|---|---|
| Selo da entrada `ei` | `D+` `daysBetweenSpDates(dia(e1), dia(ei))` | `buildCadenceTimeline` |
| Primeiro contato | sempre `D+0` | `buildCadenceTimeline` |
| Mesmo dia | mesmo `D+N` para todos os eventos daquele dia | `buildCadenceTimeline` |
| Resumo | `daysBetweenSpDates(dia(en), dia(hoje))` → hoje / ontem / há N dias | `lastContactLabel` |
| Contador | `n` | `events.length` |
| Contato hoje? | existe `ei` com `dia(ei) === dia(hoje)` | `hasContactToday` |

Tudo em **dias-calendário**, não em horas. Um contato às 23h50 e outro às 00h10
do dia seguinte são D+0 e D+1, separados por 20 minutos. É o que "D+N" promete.

Fuso **explícito** em toda conversão, no molde de `current-month.ts`. O motivo é
concreto: com hora local do browser, um vendedor em viagem ou com o relógio do
sistema em outro fuso veria D+N e "contato hoje" deslocados em um dia, sem erro
nenhum aparecer na tela.

---

## 4. Casos de teste - `src/lib/contact-cadence.test.ts`

Vitest. Todos com `now` injetado; nenhum depende do relógio real da máquina.

**`spDateKey`**

1. ISO UTC no meio do dia devolve a data de SP (`2026-10-05T15:00:00Z` → `2026-10-05`).
2. **Virada de dia em SP:** `2026-10-06T02:00:00Z` é 23h do dia **05** em SP
   (UTC-3) → `2026-10-05`. É o caso que quebra qualquer implementação que use
   `toISOString().slice(0,10)`.
3. **Virada no outro sentido:** `2026-10-05T03:30:00Z` → `2026-10-05` (00h30 em SP).
4. Aceita `Date` e string ISO com o mesmo resultado.

**`daysBetweenSpDates`**

5. Mesmo dia → `0`.
6. Dias consecutivos → `1`.
7. Atravessando mês (`2026-09-30` → `2026-10-02`) → `2`.
8. Atravessando ano (`2026-12-31` → `2027-01-01`) → `1`.
9. Ordem invertida → negativo.
10. **Janela de horário de verão:** um intervalo que, em horário local, teria
    23h ou 25h, ainda devolve inteiro exato. Garante que a conta é em UTC, não
    em local (Brasil não tem DST hoje, mas a função não pode depender disso).

**`buildCadenceTimeline`**

11. Lista vazia → `[]`.
12. Um evento → `dPlus: 0`.
13. Três eventos em 01/10, 02/10 e 05/10 → devolvidos como
    `[05/10 D+4, 02/10 D+1, 01/10 D+0]` (decrescente, com os selos corretos).
14. **Dois contatos no mesmo dia** (09h e 18h de 03/10, primeiro contato em
    01/10) → **ambos com `dPlus: 2`**, e os dois presentes na lista.
15. **Entrada fora de ordem:** eventos passados em ordem embaralhada produzem
    exatamente o mesmo resultado do caso 13. A função não confia na ordem.
16. **Dois contatos no mesmo dia sendo os primeiros do lead:** ambos `dPlus: 0`.
17. **Recálculo ao remover o primeiro evento:** partindo de
    `[01/10, 02/10, 05/10]` e recalculando sobre `[02/10, 05/10]`, os selos
    passam a `02/10 D+0` e `05/10 D+3`. Ou seja, **remover o primeiro contato
    renumera todos os demais** (RF-10 + critério 7 do PRD). Este é o teste que
    protege contra alguém "otimizar" o `dPlus` guardando um índice.
18. **Virada de dia dentro da série:** evento em `2026-10-05T23:50` SP e outro em
    `2026-10-06T00:10` SP → `D+N` e `D+N+1`.

**`lastContactLabel`**

19. Vazio → `null`.
20. Último contato hoje → `'Ultimo contato hoje'`.
21. Último contato ontem → `'Ultimo contato ontem'`.
22. Último contato há 3 dias → `'Ultimo contato ha 3 dias'`.
23. Usa o **último** evento mesmo quando a lista chega em ordem crescente.
24. `contacted_at` no futuro → clampa em `'Ultimo contato hoje'`, nunca dias
    negativos.

**`hasContactToday`**

25. Evento hoje às 00h05 em SP → `true`.
26. Evento ontem às 23h55 em SP → `false`, mesmo com 10 minutos de distância.
    Espelho do caso 25: é a diferença entre "dia-calendário" e "24 horas".
27. Lista vazia → `false`.
28. Vários eventos, só um deles hoje → `true`.

---

## 5. Ordem de implementação

Dependências respeitadas: lógica pura e testes antes de qualquer UI.

1. **Tipo.** `LeadContactEvent` em `src/types/database.ts` (§2.1). Tudo abaixo
   importa daqui.
2. **Lógica pura + testes (TDD).** `src/lib/contact-cadence.ts` com
   `contact-cadence.test.ts` (§1.1, §1.2, §4). Red → green → refactor. É onde
   mora todo o risco de cálculo: D+N, virada de dia em SP, "há N dias". Testado
   antes de existir tela.
3. **Dispensa.** `src/lib/cadence-dismissal.ts` (§1.3).
4. **Service.** `lead-contact-events.service.ts` (§1.4).
5. **Hooks.** `use-lead-cadence.ts` (§1.5), incluindo `cadenceQueryKey`.
6. **Painel.** `lead-cadence-panel.tsx` (§1.6) + a linha em `contact-panel.tsx`
   (§2.4). **Checkpoint no navegador:** linha do tempo, resumo, contador e
   remoção já funcionam inteiros, com registros feitos à mão. Vale verificar
   aqui, antes de empilhar o aviso em cima.
7. **Store.** Campos e ações em `inbox.store.ts` (§2.2).
8. **Gancho de envio.** `onSuccess` em `use-messages.ts` (§2.3).
9. **Faixa do aviso.** `cadence-nudge-bar.tsx` (§1.7) + a linha em
   `chat-window.tsx` (§2.5).
10. **PVO.**

Os passos 1 a 6 entregam valor sozinhos. O aviso (7 a 9) é incremento sobre uma
base já verificada, e se precisar sair do escopo, sai sem desfazer nada.

---

## 6. Nenhuma coluna de `veltzy.leads` é alterada

**Confirmado.** Esta feature não escreve em `veltzy.leads` em lugar nenhum:

- O único service novo (§1.4) opera exclusivamente em
  `veltzy.lead_contact_events`. Não importa `leads.service.ts` e não emite
  `.from('leads')`.
- Registrar ou remover contato **não** toca `conversation_status`,
  `first_response_at`, `last_customer_message_at`, `sla_breached`, `temperature`,
  `ai_score`, `updated_at` nem qualquer outra coluna de `leads` (RF-11).
- O `onSuccess` de `useSendMessage` (§2.3) só **acrescenta** uma chamada ao
  store. Os updates em `leads` que já existem hoje dentro de `sendMessage`
  (`conversation_status: 'replied'` e `first_response_at`, em
  `messages.service.ts:35-43`) **continuam exatamente como estão** e não são
  parte desta feature.
- Nenhuma coluna nova em `leads` (contador, `last_contacted_at` ou similar) é
  proposta. O PRD §4.2 já descartou o contador denormalizado: a linha do tempo e
  o D+N exigem a data de cada evento, que um contador não guarda.
- Nenhum `UPDATE` em `lead_contact_events` (§0). O banco nega, e o app não tenta.

A leitura de `leads` continua sendo a que já existe (`useConversationList`,
`getLeadById`), sem campo novo.

---

## 7. Verificação (PVO)

As quatro evidências, nenhuma dedutível:

1. `npx tsc -b` limpo. **Não** `tsc --noEmit`: o tsconfig deste repo é
   solution-style e `--noEmit` não checa nada.
2. `npm run build` limpo.
3. `npm run lint` sem erro novo contra o merge-base (`git merge-base HEAD develop`),
   não contra o working tree com stash.
4. Teste no navegador, contra o **staging**, cobrindo:
   - registrar, ver o selo D+0, o contador e o resumo aparecerem;
   - segundo contato em outro dia com o D+N correto;
   - remover o primeiro evento e ver os selos restantes **renumerarem**;
   - enviar mensagem para lead sem contato hoje e ver a faixa aparecer entre as
     mensagens e o campo de digitação;
   - "Agora nao", recarregar a página, enviar outra mensagem: a faixa **não**
     volta no mesmo dia;
   - "Registrar" pela faixa e ver a linha do tempo atualizar sem reload;
   - enviar mensagem para lead que já tem contato hoje: sem faixa;
   - trocar de lead com a faixa aberta: ela some.

Mais `npx vitest run src/lib/contact-cadence.test.ts` verde.

Verificação em aparelho real para o layout da faixa e do painel abaixo de `xl`,
onde o painel Contato abre em overlay e a faixa precisa continuar visível.
