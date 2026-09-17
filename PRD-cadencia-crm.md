# PRD - Cadência de contato com leads (inbox)

> Fase 1 do SDD: PESQUISA. Nenhum código de aplicação foi escrito ou alterado.
> Nenhuma migration foi criada. Este documento mapeia o estado atual e propõe o
> modelo. A migration correspondente nasce no repo do **Hub**, não aqui.

**Repo:** Veltzy CRM, multi-tenant SaaS white-label (Daxen Labs).
**Stack:** React 19 + Vite 5 + TypeScript 5 + Tailwind 3 + shadcn/Radix, TanStack
React Query v5 (server state) + Zustand (client state), Supabase (Auth,
PostgreSQL schema `veltzy`, Realtime, Storage, Edge Functions), Vercel.
pt-BR, America/Sao_Paulo.

**Restrição de arquitetura confirmada em `docs/AMBIENTES.md`:** o Veltzy
**consome** o schema do Central, não é dono. Dev e develop apontam para o
staging (`hfebvugdsztnzgpybdwj`). As Edge Functions em `supabase/functions/`
são deste repo; o schema não é.

---

## 1. Estado atual

### 1.1 Inbox

`src/pages/inbox.tsx` (104 linhas) é uma página fina que monta três colunas:

| Coluna | Componente | Arquivo |
|---|---|---|
| Lista de conversas | `ConversationList` | `src/components/inbox/conversation-list.tsx` |
| Conversa | `ChatWindow` | `src/components/inbox/chat-window.tsx` |
| Painel direito "Contato" | `ContactPanel` | `src/components/inbox/contact-panel.tsx` |

Rota canônica: `/inbox/:leadId`. `?lead=<id>` redireciona para ela.
O lead selecionado vem de `useConversationList()`; se não estiver na lista (lead
manual sem mensagem), há um fallback `useQuery(['lead-for-inbox', id])` que
chama `getLeadById`. O tipo entregue aos dois painéis é `LeadWithLastMessage`.

Abertura do painel: `useInboxStore().contactPanelOpen` (`boolean | null`,
`null` = segue o breakpoint via `useIsPanelInline()`). Inline em `xl+`, overlay
abaixo disso. Existe **uma única instância** do `ContactPanel` montada.

`ChatWindow` (57 linhas) empilha, de cima para baixo:
`ChatHeader` → `LeadDealsPanel` → banner de WhatsApp desconectado (condicional)
→ `AdContextCard` (condicional) → `MessageList` → `ChatInput`.

### 1.2 Painel "Contato"

`src/components/inbox/contact-panel.tsx`, **510 linhas**. Já está bem acima do
teto de ~200 linhas do CLAUDE.md, o que é relevante para a decisão de onde
colocar a cadência (ver 6.1).

Estrutura interna, na ordem de render dentro do container scrollável:

1. Header fixo: título "Contato" + botão X (`setContactPanelOpen(false)`).
2. Cabeçalho compacto: avatar, nome (`leadDisplayName`), telefone, instância
   WhatsApp (condicional), selo de score.
3. Barra de temperatura (`leadTemperatureConfig`).
4. Seção **Dados** (nome, email, empresa, instagram, linkedin, origem,
   responsável) com flush em troca de lead e em unmount.
5. `<LeadDealsPanel leadId={lead.id} />` - seção **Negócios**.
6. Seção **Observações** com auto-save debounced de 1s.
7. Seção **Tags** (`LeadTagsInput`).
8. Seção **Tarefas** (`useLeadTasks`, `useCompleteTask`, `CreateTaskModal`).

Há um helper local `SectionHeader({ label })` que desenha o título de seção
(linha fina + label uppercase tracking-widest 10px). É o padrão visual a seguir.

**Onde a cadência entra:** nova seção **entre Negócios (5) e Observações (6)**,
como componente próprio `lead-cadence-panel.tsx`, chamado com `leadId`. Fica
logo abaixo de Negócios porque as duas respondem à mesma pergunta ("em que pé
está esse lead") e acima de Observações, que é texto livre e cresce.

### 1.3 Modelo de dados relevante

**Não existe `src/types/database.types.ts`.** Os tipos não são gerados por
`supabase gen types`. São escritos à mão em **`src/types/database.ts`**
(781 linhas). Consequência para esta feature: adicionar o tipo novo é edição
manual naquele arquivo, e o TypeScript **não** vai avisar se a tabela real no
Central divergir do tipo escrito aqui.

Client: `src/lib/supabase.ts` expõe `supabase` (schema `public` por default) e o
helper `veltzy()` = `supabase.schema('veltzy')`. Tabelas de domínio vivem em
`veltzy.*`; `companies`, `profiles`, `user_roles`, `oauth_integrations` vivem em
`public.*`.

#### `veltzy.leads` (interface `Lead`, `src/types/database.ts:220`)

Campos que importam aqui:

| Campo | Papel |
|---|---|
| `id: string` (uuid) | **Identifica o lead.** É a chave da conversa também. |
| `company_id: string` (uuid) | **Identifica o tenant.** FK `public.companies`. |
| `assigned_to: string \| null` | **Vendedor dono**, FK `public.profiles.id`. |
| `name`, `phone`, `email` | Dados pessoais do lead (ver LGPD). |
| `conversation_status` | `unread \| read \| replied` |
| `first_response_at` | Já existe: momento da primeira resposta humana. |
| `last_customer_message_at`, `sla_breached` | Métricas de atendimento já presentes. |

**Não existe tabela de conversa.** A conversa **é** o lead: as mensagens
referenciam `messages.lead_id`, e o estado da conversa é coluna de `leads`.
Portanto a cadência é por **lead**, e `lead_id` é a chave correta.

#### `veltzy.messages` (interface `Message`, `src/types/database.ts:370`)

`id`, `lead_id`, `company_id`, `content`, `sender_type` (`human | ai | customer`),
`message_type`, `source` (`manual | whatsapp | instagram | ...`),
`delivery_status` (`sent | failed | pending`), `instance_name`, `is_read`,
`created_at`.

`sender_type === 'human'` é o que distingue mensagem do vendedor de mensagem da
IA SDR e do cliente. Essencial para a regra de "primeira mensagem do dia".

#### `public.profiles` (interface `Profile`, `src/types/database.ts:57`)

`id`, `user_id`, `company_id`, `name`, `email`, `default_whatsapp_instance`.
Atenção: `profiles.id` **não é** `auth.uid()`. `profiles.user_id` é que aponta
para o usuário do Supabase Auth. Isso importa para a RLS e para quem gravar em
`registered_by` (ver 4 e 5).

---

## 2. Fluxo de envio de mensagem (outbound)

Este é o alicerce do aviso. O caminho completo, de cima para baixo:

```
ChatInput.handleSend()                     src/components/inbox/chat-input.tsx:110
  └─ sendMessage.mutateAsync({ leadId, content })
       └─ useSendMessage()                 src/hooks/use-messages.ts:64
            └─ messagesService.routeMessage(companyId, payload)
                                           src/services/messages.service.ts:176
```

`routeMessage` tem três saídas, e **todas retornam `Promise<Message>`**:

1. Lead com `phone` + WhatsApp conectado → `supabase.functions.invoke('whatsapp-send')`.
2. Lead com origem `instagram` + Instagram conectado → `instagram-send`.
3. Fallback → `sendMessage()`, insert direto em `veltzy.messages`.

`useSendMessage` já tem update otimista (`onMutate` injeta uma mensagem
`optimistic-*` com `delivery_status: 'pending'`) e, no sucesso, invalida
`['messages', leadId]` e `['conversations']`.

### 2.1 Dá para detectar o envio no frontend? Sim.

`useSendMessage().onSuccess(data, variables)` recebe:

- `variables.leadId` → **para qual lead** a mensagem foi.
- `data` → o `Message` retornado, com `created_at` do servidor quando as edge
  functions o devolvem (o fallback direto devolve a linha do insert).

Além disso, os **três** pontos de envio do chat passam pela mesma mutation:

| Origem do envio | Arquivo |
|---|---|
| Texto (Enter / botão) | `chat-input.tsx:110` `handleSend` |
| Anexo (imagem, doc, vídeo) | `chat-input.tsx:127` `handleFileUpload` |
| Áudio gravado | `src/components/inbox/audio-recorder.tsx` |

Ou seja: **um único gancho em `useSendMessage.onSuccess` cobre os três**. Não
precisa instrumentar cada componente.

### 2.2 Veredito: abordagem SOMENTE FRONTEND é viável. Recomendada.

Não é preciso trigger no banco nem Edge Function nova para o aviso. A sequência
inteira roda no cliente:

1. `useSendMessage.onSuccess` dispara com `leadId`.
2. Lê `['cadence', leadId]` do cache do React Query (a linha do tempo já está
   carregada quando o painel abriu; se não estiver, `fetchQuery` resolve).
3. Compara a data-calendário em America/Sao_Paulo do último evento com hoje.
4. Se não há evento hoje (e as demais condições de 4.2), mostra o aviso.

**Ressalva honesta sobre "primeira do dia":** o gatilho literal ("a mensagem que
acabou de sair é a primeira humana do dia nesta conversa") é verificável no
cliente lendo o cache `['messages', leadId]`, que o `ChatWindow` já mantém e que
o realtime mantém fresco. Isso funciona para a conversa **aberta**. Se o
vendedor tiver enviado a primeira mensagem do dia por outro dispositivo, o cache
local não sabe disso sem refetch; como `useMessages` faz refetch ao montar a
conversa, o caso prático está coberto. Não vale backend para isso.

**Backend não é proposto.** Não há nada que o frontend não consiga ver.

---

## 3. Requisitos funcionais

Cada marcação de contato é um **evento** com data. O registro é sempre manual.

### Linha do tempo

- **RF-01.** O painel "Contato" exibe uma seção **Cadência** com a linha do
  tempo de contatos registrados do lead selecionado, ordenada do mais recente
  para o mais antigo.
- **RF-02.** Cada entrada da linha do tempo mostra a **data** do contato
  formatada em pt-BR (`dd/MM/yyyy`) e um **selo D+N**.
- **RF-03.** `N` do selo = número de dias-calendário (America/Sao_Paulo) entre a
  data do **primeiro** contato registrado do lead e a data daquela entrada. O
  primeiro contato é sempre **D+0**. Um contato do dia seguinte é **D+1**.
- **RF-04.** Dois contatos no mesmo dia-calendário carregam o **mesmo** selo
  D+N. O selo mede dias desde o primeiro contato, não posição na lista.
- **RF-05.** Sem nenhum contato registrado, a seção exibe estado vazio
  ("Nenhum contato registrado") e o botão de registrar.

### Resumo e contador

- **RF-06.** A seção exibe o resumo **"Último contato há N dias"**, onde N é a
  diferença em dias-calendário (SP) entre a data do **último** contato e hoje.
  Se o último contato foi hoje, o texto é "Último contato hoje". Se foi ontem,
  "Último contato ontem".
- **RF-07.** O título da seção exibe o **total** de contatos registrados, no
  formato `Cadência (N)`, espelhando `Negócios (N)` do `LeadDealsPanel`.

### Registro manual

- **RF-08.** Botão **"Registrar contato"** na seção cria um evento com
  `contacted_at = agora`.
- **RF-09.** O registro é otimista na UI e reverte em erro, com `toast.error`.
- **RF-10.** Cada entrada da linha do tempo pode ser **removida** pelo usuário
  que a registrou, ou por admin/manager da empresa (corrige clique errado).
  Confirmação via `AlertDialog`, padrão já usado em `LeadDealsPanel`.
- **RF-11.** Registrar contato **não** altera `leads.conversation_status`,
  `first_response_at` nem qualquer outra coluna de `leads`.

### Aviso de primeira mensagem do dia

- **RF-12.** Após um envio **bem-sucedido** do vendedor para um lead, se for a
  primeira mensagem humana do dia naquela conversa **e** não houver contato
  registrado hoje para aquele lead **e** o aviso não tiver sido dispensado hoje
  para aquele lead, exibir o aviso.
- **RF-13.** O aviso pergunta: *"Primeira mensagem do dia para este contato.
  Registrar um contato?"* com dois botões: **Registrar** e **Agora não**.
- **RF-14.** **Registrar** cria o evento de contato de hoje (que vira D+0 se for
  o primeiro contato do lead), fecha o aviso, atualiza linha do tempo, resumo e
  contador.
- **RF-15.** **Agora não** fecha o aviso e **não cria nada**.
- **RF-16.** **Dedupe: no máximo um aviso por lead por dia.** Depois de
  Registrar ou de Agora não, o aviso não reaparece para aquele lead naquele dia,
  mesmo que o vendedor envie mais mensagens.
- **RF-17.** O envio de mensagem **nunca** registra contato sozinho. O aviso é
  lembrete; o registro é sempre um clique explícito.
- **RF-18.** O aviso não aparece para mensagens enviadas pela **IA SDR**
  (`sender_type = 'ai'`). Só envio humano dispara.
- **RF-19.** O aviso não aparece se o envio falhou (`onError` da mutation, ou
  `delivery_status = 'failed'` retornado).

---

## 4. Modelo de dados proposto

> **Nada abaixo é para aplicar.** É SQL de **referência** para a migration que
> será escrita no repo do **Hub**. Antes de escrevê-la, conferir na baseline do
> Hub se o nome escolhido colide com algo existente no Central.

### 4.1 Tabela de eventos

**Nome proposto: `veltzy.lead_contact_events`.**

Evitar `lead_contacts`: no vocabulário do produto "contato" **já significa o
lead** (a página `/contatos` lista leads, `ContactPanel` é o painel do lead).
`lead_contacts` leria como "os leads do lead". `lead_contact_events` (ou
`lead_touchpoints`) não tem essa ambiguidade.

```sql
-- REFERÊNCIA. A migration real nasce no repo do Hub.
CREATE TABLE veltzy.lead_contact_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES veltzy.leads(id)     ON DELETE CASCADE,
  registered_by UUID          REFERENCES public.profiles(id)  ON DELETE SET NULL,
  contacted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_contact_events_lead       ON veltzy.lead_contact_events(lead_id, contacted_at DESC);
CREATE INDEX idx_lead_contact_events_company    ON veltzy.lead_contact_events(company_id);
CREATE INDEX idx_lead_contact_events_registered ON veltzy.lead_contact_events(registered_by);

ALTER TABLE veltzy.lead_contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_contact_events_company_isolation"
ON veltzy.lead_contact_events
FOR ALL TO authenticated
USING      (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
```

Notas sobre o formato:

- `company_id NOT NULL` com FK para `public.companies`, e a policy no padrão
  `company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin()`.
  É exatamente o molde de `veltzy.tasks` em
  `supabase/migrations/015_tasks_module.sql`, a referência mais próxima.
- `registered_by` aponta para `public.profiles(id)`, coerente com
  `tasks.created_by` / `tasks.assigned_to`. **Não** é `auth.uid()`; é
  `profiles.id`. `ON DELETE SET NULL` preserva o histórico se o vendedor sair.
- Sem `updated_at` e sem trigger: o evento é imutável. Corrigir = apagar e
  registrar de novo (RF-10).
- `note TEXT` é opcional e **fica fora do escopo desta fase** na UI. Existe na
  coluna para não exigir uma segunda migration quando for pedido. Se a preferência
  for não criar coluna sem uso, remover da migration; o resto não muda.
- **Sem constraint de unicidade por dia.** Registrar dois contatos no mesmo dia é
  legítimo (ligou de manhã, mandou mensagem à tarde). O "um por dia" do RF-16 é
  regra do **aviso**, não do dado.

### 4.2 Por que tabela de eventos e não contador em `leads`

Guardar `leads.contact_count INT` (e/ou `leads.last_contacted_at`) seria mais
barato de ler, e é insuficiente:

| Requisito | Contador em `leads` | Tabela de eventos |
|---|---|---|
| Contador total (RF-07) | sim | sim, `COUNT(*)` |
| "Último contato há N dias" (RF-06) | sim, com `last_contacted_at` | sim, `MAX(contacted_at)` |
| Linha do tempo com uma entrada por contato (RF-01) | **não** | sim |
| Selo D+N por entrada (RF-02, RF-03) | **não**, exige a data de cada contato e a do primeiro | sim |
| Desfazer um registro errado (RF-10) | decrementa, mas a data perdida não volta | sim, `DELETE` da linha |
| Quem registrou | **não** | sim, `registered_by` |
| Auditoria / LGPD (o que foi registrado e quando) | **não** | sim |
| Concorrência (dois dispositivos registrando) | `UPDATE ... SET count = count + 1` é corrida | `INSERT` não colide |

O contador é uma **projeção** da tabela de eventos, e projeção derivada de dado
que não existe mais não se reconstrói. A linha do tempo e o D+N são o coração da
feature, então a tabela de eventos é o mínimo, não um exagero.

Se o volume virar problema (não vai: são unidades por lead), a otimização certa
depois é uma coluna denormalizada mantida por trigger **em cima** da tabela de
eventos, nunca no lugar dela.

### 4.3 Regras de cálculo, explícitas

Seja `E = [e1, e2, ..., en]` os eventos do lead ordenados por `contacted_at`
crescente, e `dia(x)` = data-calendário de `x` no fuso **America/Sao_Paulo**
(chave `YYYY-MM-DD`).

- **Selo D+N da entrada `ei`:** `N = dia(ei) - dia(e1)` em dias inteiros.
  `e1` é sempre `D+0`. Entradas no mesmo dia-calendário têm o mesmo `N` (RF-04).
- **"Último contato há N dias":** `N = dia(hoje) - dia(en)`.
  `N = 0` → "hoje". `N = 1` → "ontem". `N >= 2` → "há N dias".
- **Contador:** `n`, o total de eventos do lead.
- **"Há contato registrado hoje?":** existe `ei` com `dia(ei) = dia(hoje)`.

Os três cálculos usam **dia-calendário, não horas.** Um contato às 23h e outro
às 01h do dia seguinte são D+0 e D+1, apesar de separados por duas horas. É o
comportamento que "D+N" promete.

### 4.4 Timezone

O projeto **não usa date-fns** (conferido em `package.json`). Duas convenções
convivem hoje:

- `src/lib/current-month.ts` faz o certo: `Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo' })` para derivar a chave de data, com comentário
  explicando que formatar na timezone evita cortar errado perto da virada.
- `src/lib/period-range.ts` usa hora **local do browser**, com o comentário
  "o código roda no browser da usuária, então local é America/Sao_Paulo na
  prática".

Para esta feature, **America/Sao_Paulo explícito**, no molde de
`current-month.ts`. O motivo é concreto: um vendedor com o relógio do sistema em
outro fuso (viagem, máquina mal configurada, VPN) veria D+N e "primeira do dia"
deslocados em um dia, sem erro nenhum aparecer. O helper novo generaliza
`spYearMonth` para `spDateKey`.

`contacted_at` é gravado como `TIMESTAMPTZ` (instante absoluto). Toda a
interpretação de "que dia é esse" acontece na leitura, em SP.

---

## 5. Regra do aviso

### 5.1 Gatilho

`useSendMessage().onSuccess(data, variables)` em `src/hooks/use-messages.ts:64`.
Um único ponto cobre texto, anexo e áudio (ver 2.1).

O hook é compartilhado, então o efeito **não** deve renderizar UI a partir dali.
Proposta: `onSuccess` publica a intenção no `inbox.store`
(`requestCadenceNudge(leadId)`), e o componente que renderiza o aviso lê do
store. Isso mantém o hook livre de UI, respeita "lógica em hooks, estado em
Zustand", e evita passar `onSent` por três componentes.

### 5.2 Como decidir "primeira do dia"

Avaliado no cliente, sem query nova, na ordem abaixo. Qualquer condição falsa
aborta o aviso:

1. **Envio humano e bem-sucedido.** Está em `onSuccess`, e o envio do chat é
   sempre `sender_type: 'human'`. Mensagem da IA SDR não passa por aqui (RF-18).
   Falha cai em `onError` (RF-19).
2. **É a primeira mensagem humana do dia nesta conversa.** Lê o cache
   `['messages', leadId]` (mantido por `useMessages` + realtime) e conta as
   mensagens com `sender_type === 'human'` e `spDateKey(created_at) === hoje`,
   ignorando as `optimistic-*`. Se a contagem, após a mensagem recém-enviada,
   for exatamente 1, é a primeira do dia.
3. **Não existe contato registrado hoje para o lead.** Lê `['cadence', leadId]`;
   se não estiver no cache, `queryClient.fetchQuery`.
4. **Não foi dispensado hoje para este lead.** Ver 5.4.

### 5.3 Onde o aviso aparece

**Recomendação: faixa inline no `ChatWindow`, entre `MessageList` e
`ChatInput`.** (A confirmar com a Leticia.)

Motivo: é onde o olho do vendedor está no instante em que ele aperta Enter, e
não depende do painel "Contato" estar aberto (abaixo de `xl` ele está fechado
por padrão). Visualmente é o mesmo slot do banner "WhatsApp desconectado" que já
existe no `ChatWindow`, então o padrão já está estabelecido no arquivo.

Alternativas consideradas e por que não:

| Opção | Problema |
|---|---|
| `toast` (sonner) com botão de ação | Some sozinho em segundos. Um lembrete que evapora sem ser lido derrota o propósito. Já é o padrão de feedback do projeto, mas para confirmação, não para lembrete acionável. |
| `Dialog` modal | Bloqueia a tela depois de **toda** primeira mensagem do dia. Interrompe o vendedor no meio do fluxo de atendimento. Desproporcional a um lembrete. |
| Dentro da seção Cadência no `ContactPanel` | Invisível quando o painel está fechado, que é o default abaixo de `xl`. O aviso nunca seria visto em telas menores. |
| `Popover` ancorado no botão de enviar | Fecha em qualquer clique fora, inclusive ao continuar digitando. |

A faixa inline é dispensável a qualquer momento, não bloqueia nada, e não some
sozinha.

### 5.4 Comportamento dos botões

- **Registrar:** chama a mutation de criação com `contacted_at = agora`, fecha a
  faixa, marca o lead como "já resolvido hoje", invalida `['cadence', leadId]`.
  A linha do tempo, o resumo e o contador atualizam. Se for o primeiro contato
  do lead, essa entrada é **D+0**.
- **Agora não:** fecha a faixa, **não cria nada**, marca o lead como
  "já dispensado hoje".

Ambos satisfazem RF-16: o aviso não volta para aquele lead naquele dia.

### 5.5 Dispensar e recarregar a página (DECISÃO A CONFIRMAR)

Se a pessoa clica "Agora não" e depois recarrega ou volta para a conversa:

- **Opção A (recomendada): a dispensa persiste no dia.** Guardar a chave
  `veltzy:cadence-dismissed:<leadId>:<YYYY-MM-DD em SP>` em `localStorage`.
  O projeto já usa `sessionStorage`/`localStorage` para estado efêmero de fluxo
  (`src/components/auth/protected-route.tsx`, `src/pages/aceitar-convite.tsx`),
  então não é padrão novo. Custo zero de schema. Limitação honesta: é **por
  navegador**, então dispensar no desktop não dispensa no celular. Para um
  lembrete, isso é aceitável.
- **Opção B: a dispensa vale só na sessão.** `sessionStorage`, ou só estado em
  memória. Recarregar traz o aviso de volta na próxima mensagem enviada. Mais
  insistente; pode virar irritação em quem recarrega muito.
- **Opção C: persistir a dispensa no banco.** Coluna ou tabela nova só para
  guardar "não quis registrar". Sincroniza entre dispositivos, mas custa uma
  migration no Hub para um dado sem valor de negócio. **Não recomendo.**

Note que a dispensa em storage vale apenas para o caso "dispensou". Se a pessoa
**registrou**, o dedupe não depende de storage nenhum: existe evento hoje, e a
condição 3 de 5.2 já barra o aviso em qualquer dispositivo.

---

## 6. Arquivos a criar e a modificar (Veltzy)

### 6.1 Criar

| Caminho | Conteúdo |
|---|---|
| `src/lib/contact-cadence.ts` | Lógica pura: `spDateKey(date)`, `daysBetweenSpDates(a, b)`, `buildCadenceTimeline(events)` (retorna entradas com `dPlus`), `lastContactLabel(events, now)`, `hasContactToday(events, now)`, `isFirstHumanMessageToday(messages, now)`. Sem React, sem Supabase. |
| `src/lib/contact-cadence.test.ts` | Vitest sobre o arquivo acima. Padrão já usado em `src/lib/current-month.ts` + testes irmãos e em `contact-panel.test.ts`. |
| `src/services/lead-contact-events.service.ts` | `getContactEvents(companyId, leadId)`, `createContactEvent(companyId, payload)`, `deleteContactEvent(companyId, eventId)`. Funções puras sobre `veltzy()`, sempre filtrando `company_id` no código além da RLS. |
| `src/hooks/use-lead-cadence.ts` | `useLeadCadence(leadId)`, `useCreateContactEvent()`, `useDeleteContactEvent()`. React Query, queryKey `['cadence', companyId, leadId]`. |
| `src/components/inbox/lead-cadence-panel.tsx` | Seção "Cadência (N)" do painel Contato: resumo, botão registrar, linha do tempo com selos D+N, estado vazio, `AlertDialog` de remoção. Molde: `lead-deals-panel.tsx`. |
| `src/components/inbox/cadence-nudge-bar.tsx` | A faixa do aviso, entre `MessageList` e `ChatInput`. Molde visual: o banner de WhatsApp desconectado em `chat-window.tsx:37`. |

### 6.2 Modificar

| Caminho | Mudança |
|---|---|
| `src/types/database.ts` | Adicionar `interface LeadContactEvent` e o payload de criação. Manual, o arquivo não é gerado. |
| `src/components/inbox/contact-panel.tsx` | Uma linha: `<LeadCadencePanel leadId={lead.id} />` entre `<LeadDealsPanel>` e a seção Observações. **Nada mais.** O arquivo já tem 510 linhas; toda a lógica fica no componente novo. |
| `src/components/inbox/chat-window.tsx` | Renderizar `<CadenceNudgeBar leadId={lead.id} />` entre `MessageList` e `ChatInput`. |
| `src/hooks/use-messages.ts` | Em `useSendMessage.onSuccess`, publicar a intenção do aviso no `inbox.store`. Sem UI aqui. |
| `src/stores/inbox.store.ts` | Campo `cadenceNudgeLeadId: string \| null` + ações `requestCadenceNudge(leadId)` / `clearCadenceNudge()`. |

### 6.3 Fora deste repo

| Onde | O quê |
|---|---|
| Repo do **Hub**, `supabase/migrations/` | A migration de `veltzy.lead_contact_events`: tabela, índices, RLS. Nunca em `supabase/migrations/` do Veltzy, mesmo sendo tabela do schema `veltzy`. |

Antes de escrever a migration no Hub, conferir na **baseline do Hub** que o nome
da tabela não colide e que `veltzy.get_current_company_id()` /
`veltzy.is_super_admin()` existem com essa assinatura. As migrations do Veltzy
não são fonte confiável sobre o estado real do Central.

### 6.4 Componentes afetados

`ContactPanel` (uma linha), `ChatWindow` (uma linha), `ChatInput` e
`AudioRecorder` (**nenhuma mudança**, o gancho está na mutation compartilhada).

---

## 7. Ordem de implementação

1. **Migration no Hub.** Escrever, revisar e aplicar no **staging**. Sem a
   tabela, nada abaixo tem como ser testado de verdade.
2. **Tipos.** `LeadContactEvent` em `src/types/database.ts`.
3. **Lógica pura + testes (TDD).** `src/lib/contact-cadence.ts` com
   `contact-cadence.test.ts`. É onde mora todo o risco de cálculo: D+N, virada
   de dia em SP, "há N dias", "primeira do dia". Testar antes de ter UI.
4. **Service.** `lead-contact-events.service.ts`, com filtro por `company_id` no
   código além da RLS.
5. **Hooks.** `use-lead-cadence.ts`.
6. **Painel.** `lead-cadence-panel.tsx` + a linha no `contact-panel.tsx`.
   Neste ponto a linha do tempo, o resumo e o contador já funcionam inteiros, e
   dá para verificar no navegador com registros manuais.
7. **Store + gancho de envio.** `inbox.store.ts` e `use-messages.ts`.
8. **Faixa do aviso.** `cadence-nudge-bar.tsx` + a linha no `chat-window.tsx`.
9. **Dedupe da dispensa** conforme a opção confirmada em 5.5.
10. **PVO:** `tsc -b`, `npm run build`, `npm run lint`, diff revisado, e teste no
    navegador com aparelho real. Nota: `tsc --noEmit` não checa nada neste repo
    (tsconfig solution-style); é `tsc -b`.

Os passos 1 a 6 entregam valor sozinhos (registro manual + linha do tempo). O
aviso (7 a 9) é incremento em cima de uma base já verificada.

---

## 8. LGPD

O tratamento aqui é do Veltzy como **operador**; a empresa cliente é a
controladora dos dados do lead. Referência: `docs/legal/politica-privacidade.md`.

### 8.1 Dados pessoais que a feature toca

| Dado | Onde | Titular | Base legal |
|---|---|---|---|
| `lead_id` (identifica indiretamente o lead: nome, telefone, email em `veltzy.leads`) | `lead_contact_events.lead_id` | Lead (contato final) | Execução de contrato entre o Veltzy e a empresa cliente; legítimo interesse da empresa cliente controladora na gestão do relacionamento comercial. Mesma base já declarada para "comunicação com contatos finais" na política vigente. |
| `contacted_at` (quando o vendedor contatou) | `lead_contact_events.contacted_at` | Lead | Execução de contrato / legítimo interesse. É registro de atividade comercial, análogo às mensagens e tarefas já armazenadas. |
| `registered_by` (qual vendedor registrou) | `lead_contact_events.registered_by` | **Colaborador** da empresa cliente | Execução de contrato de trabalho / legítimo interesse do empregador na gestão da equipe. Mesmo tratamento já dado a `tasks.created_by` e `messages` do vendedor. |
| `note` (se vier a ser usada na UI) | `lead_contact_events.note` | Lead | Texto livre: risco de o vendedor escrever dado sensível. Se a nota entrar em escopo, o placeholder deve orientar contra dado sensível, no mesmo espírito de Observações. **Fora do escopo desta fase.** |

Pontos a registrar:

- **Nenhum dado pessoal novo é coletado.** A feature só registra **quando** um
  contato já existente foi tocado. Não cria campo de nome, telefone, email ou
  qualquer identificador novo do lead.
- **Minimização.** O evento guarda o mínimo: a quem, quando, por quem. Sem
  conteúdo de conversa (isso já está em `messages`), sem geolocalização, sem
  device.
- **Retenção.** `ON DELETE CASCADE` em `lead_id`: apagar o lead apaga o
  histórico de cadência junto. Isso atende pedido de eliminação (Art. 18, VI da
  LGPD) sem trabalho adicional: o fluxo de exclusão de lead que já existe passa a
  cobrir esta tabela automaticamente. **Confirmar que o CASCADE entra na
  migration** e que a rotina de exclusão/anonimização do Veltzy não usa `UPDATE`
  em vez de `DELETE` no lead, caso em que o cascade não dispara.
- **Portabilidade / acesso.** Se o export de dados do titular for exercido, a
  cadência do lead precisa entrar no pacote. `src/lib/export-leads.ts` é o ponto
  a revisitar quando/se isso virar requisito. Não está nesta fase.
- **Transferência internacional / novos subprocessadores.** Nenhuma. A feature é
  banco + frontend, sem chamada a terceiro.
- **Decisão automatizada.** Nenhuma. O registro é sempre um clique humano, e o
  aviso é um lembrete visual que não altera dado sozinho (RF-17). Isso é, por si
  só, uma escolha favorável à LGPD: nada é inferido ou gravado sem ato do
  usuário.

### 8.2 RLS

Isolamento por tenant, no padrão do projeto:

```sql
USING      (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
```

Decisões a registrar:

- **Isolamento é por `company_id`, não por vendedor.** Qualquer membro da
  empresa lê e registra cadência de qualquer lead da empresa. É consistente com
  `veltzy.tasks` e com `veltzy.messages`, e necessário: manager e admin precisam
  supervisionar a cadência da equipe, e um lead pode trocar de responsável.
- **`WITH CHECK` é obrigatório no INSERT**, não só `USING`. Sem ele, um cliente
  malicioso insere linha com `company_id` de outro tenant. É o ponto onde este
  tipo de policy costuma falhar.
- **A RLS é a última linha de defesa, não a única** (regra de ouro do CLAUDE.md).
  `lead-contact-events.service.ts` filtra `company_id` no código também, em toda
  query, como fazem `tasks.service.ts` e `messages.service.ts`.
- **Remoção (RF-10)** com autorização mais fina (autor ou admin/manager) fica na
  camada de aplicação nesta fase. Se for para virar garantia de banco, é uma
  policy `FOR DELETE` separada usando `registered_by`, e aí a policy `FOR ALL`
  acima precisa ser quebrada por operação. **Decisão a confirmar na Spec.**

A migration correspondente será feita no **Hub**.

---

## 9. O que NÃO entra nesta fase

- **Automação de disparo.** Nada envia mensagem sozinho.
- **Régua agendada de follow-up.** Sem cron, sem `pg_cron`, sem Edge Function
  agendada, sem "D+3 dispara tal coisa".
- **Notificações.** Sem push, sem email, sem sino, sem entrada no
  `notification-center.tsx`.
- **Sequências/templates de cadência** (cadência como playbook configurável).
- **Métricas de cadência no dashboard** (média de toques até fechar, etc).
- **Cadência fora da inbox:** kanban do pipeline, página `/contatos`, `/deals`.
- **Campo de nota na UI** do evento de contato.
- **Trigger ou Edge Function** para detectar envio. O frontend dá conta (ver 2.2).
- **Export do histórico de cadência** em `export-leads.ts`.

---

## 10. Critérios de aceite

Verificáveis no navegador, em aparelho real quando for layout.

### Linha do tempo, resumo e contador

1. Lead sem nenhum contato: seção "Cadência (0)", texto "Nenhum contato
   registrado", botão "Registrar contato" visível.
2. Clicar "Registrar contato" cria uma entrada com a data de hoje e selo
   **D+0**. O título vira "Cadência (1)". O resumo vira "Último contato hoje".
3. Com eventos em 01/10, 02/10 e 05/10 (fuso SP), a linha do tempo mostra, do
   mais recente para o mais antigo: 05/10 **D+4**, 02/10 **D+1**, 01/10 **D+0**.
   O título mostra "Cadência (3)".
4. Dois eventos no mesmo dia mostram **o mesmo** selo D+N, e o contador soma os
   dois.
5. Com o último contato há 3 dias, o resumo lê "Último contato há 3 dias". Há 1
   dia lê "ontem". Hoje lê "hoje".
6. Um contato registrado às 23h50 e outro às 00h10 do dia seguinte (horário de
   SP) recebem selos D+N **diferentes**, com um dia de diferença.
7. Remover uma entrada pede confirmação, e após confirmar a linha do tempo, o
   contador e o resumo recalculam. Se a entrada removida era o primeiro contato,
   **todos os selos D+N restantes são recalculados** a partir do novo primeiro.
8. Trocar de lead no inbox troca a cadência exibida. Nenhum resíduo do lead
   anterior.

### Aviso

9. Enviar a primeira mensagem do dia para um lead **sem** contato registrado hoje
   faz a faixa aparecer entre a lista de mensagens e o campo de digitação.
10. Clicar **Registrar** na faixa: a faixa fecha, um evento de hoje é criado, e a
    linha do tempo no painel Contato reflete isso **sem recarregar a página**.
11. Clicar **Agora não**: a faixa fecha e **nenhum evento é criado**. Conferir na
    linha do tempo e no contador.
12. Depois de Registrar ou de Agora não, enviar **mais** mensagens para o mesmo
    lead no mesmo dia **não** reabre a faixa (RF-16).
13. Enviar mensagem para um lead que **já tem** contato registrado hoje não
    mostra a faixa.
14. Enviar mensagem para um **segundo** lead, sem contato hoje, mostra a faixa
    para esse lead. A dispensa é por lead, não global.
15. Envio que **falha** (WhatsApp desconectado, erro da edge function) não mostra
    a faixa.
16. Mensagem enviada pela **IA SDR** não mostra a faixa.
17. Anexo e áudio disparam a faixa nas mesmas condições que texto.
18. Conforme a opção confirmada em 5.5: dispensar, recarregar a página e enviar
    outra mensagem no mesmo dia se comporta como decidido (Opção A: **não**
    reabre).

### Não-regressão

19. Enviar mensagem continua funcionando igual: update otimista, ordem das
    mensagens, realtime, `conversation_status`, `first_response_at`.
20. Registrar contato **não** altera nenhuma coluna de `veltzy.leads`.
21. O painel Contato segue com todas as seções que já tinha, na ordem, com
    Cadência inserida entre Negócios e Observações.
22. Abaixo de `xl` o painel Contato continua abrindo em overlay, e a faixa do
    aviso aparece **independentemente** de o painel estar aberto.

### Multi-tenant e segurança

23. Usuário da empresa A não lê nem cria evento de cadência para lead da empresa
    B. Verificar com a RLS ativa, não só pelo filtro do service.
24. Um `INSERT` com `company_id` de outro tenant é rejeitado pelo `WITH CHECK`.

### Técnico

25. `tsc -b` limpo (não `tsc --noEmit`, que neste repo não checa nada).
26. `npm run build` limpo.
27. `npm run lint` sem novos erros contra o merge-base.
28. Testes de `src/lib/contact-cadence.test.ts` passando, cobrindo virada de dia
    em SP, D+N com o mesmo dia repetido, e remoção do primeiro evento.

---

## 11. Pendências para a Spec (decisões suas)

1. **5.3** - A faixa inline no `ChatWindow` é a posição certa para o aviso?
2. **5.5** - Opção A (dispensa persiste no dia via `localStorage`), B (só na
   sessão) ou C (banco)? Recomendo A.
3. **4.1** - Nome da tabela: `lead_contact_events` ou `lead_touchpoints`?
4. **4.1** - A coluna `note` entra na migration desde já (sem UI) ou fica fora?
5. **8.2** - A restrição de remoção (autor ou admin/manager) fica só na
   aplicação nesta fase, ou vira policy `FOR DELETE` no Hub?
6. **RF-10** - Remover entrada entra nesta fase ou fica para depois?
