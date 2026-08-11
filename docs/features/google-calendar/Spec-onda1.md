# Spec: Google Calendar, Onda 1 (convite a partir do Inbox)

> Feature: `google-calendar` / Onda 1
> PRD: `docs/features/google-calendar/PRD.md`
> Status: Pronta para implementação
> Data: 2026-08-05
> Branch: `feat/google-calendar-convite-inbox`

---

## 0. Resumo executivo

O vendedor agenda a reunião sem sair da conversa do inbox. A Veltzy cria uma tarefa do tipo reunião, cria o evento na agenda Google do vendedor e pede ao Google que envie o convite ao email do cliente.

São três Edge Functions novas, uma tabela nova, quatro arquivos de frontend novos e sete alterados. O código de "Calendar prep" de abril é apagado, não reaproveitado.

**Regra que atravessa tudo:** falha de calendário nunca derruba nem esconde a tarefa. O `catch {}` vazio de `tasks.service.ts:160` é o defeito que esta onda existe para não repetir.

## 1. Pré-requisitos externos

Sem estes três passos nada funciona, e nenhum deles é código.

1. **Google Cloud Console:** criar projeto, habilitar Google Calendar API, criar credencial OAuth 2.0 do tipo Aplicativo Web, com origem autorizada `{APP_URL}` e URI de redirecionamento `{APP_URL}/oauth/google/callback`. Cadastrar os vendedores do piloto como usuários de teste.
2. **Secrets do Supabase:** `npx supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...`. A `APP_URL` já existe no projeto.
3. **Verificação do app:** o escopo `calendar.events` é sensível. Enquanto o app não for verificado pelo Google, funciona apenas para os usuários de teste cadastrados (limite 100) e exibe aviso de app não verificado. O processo leva semanas e deve começar assim que a credencial existir.

## 2. Backend

### 2.1 Migration, que vai no repo do HUB

**A migration não entra em `supabase/migrations/` deste repo.** O Hub é dono do histórico de migrations do banco Central, e o Veltzy só consome o schema, o que vale mesmo para tabelas do schema `veltzy`, porque migration é rastreada por banco e não por schema. Está em `docs/AMBIENTES.md`, seção "Papel do Veltzy neste esquema".

- **Onde:** repo do Hub, `supabase/migrations/`, arquivo novo com **timestamp**, não com número sequencial. Nunca editar a baseline `00000000000000_baseline.sql`.
- **Correção pendente:** a Onda 1 foi implementada com o arquivo em `supabase/migrations/071_google_calendar_connections.sql` **deste repo**, por erro desta Spec. O conteúdo está correto; o lugar não. Mover para o Hub e apagar daqui.
- **Aplicação:** `db push` no staging, com o `●` confirmado em `hfebvugdsztnzgpybdwj`. Produção é do Toni, em passo separado da promoção do código.
- **Sequenciamento:** enquanto a migration não estiver aplicada, a feature fica em stand by, para não mostrar botão que o banco recusa em silêncio.

O conteúdo abaixo é o da migration, modelada em `public.instagram_connections` (`007_admin_superadmin.sql:20`).

```sql
CREATE TABLE public.google_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcal_connections_company ON public.google_calendar_connections(company_id);
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
```

RLS, mais estrita que o precedente do Instagram, que expõe `access_token` a toda a empresa:

- `SELECT` e `ALL` apenas da própria linha. A condição é `profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())`, **não** `company_id`. Token é credencial bearer; colega de empresa não lê o token de ninguém.
- Bypass para `service_role`, no padrão já documentado em `032_document_oauth_integrations_fixes.sql`.
- `GRANT ALL` para `service_role` e `authenticated`, mesmo padrão de `031`.
- Trigger `set_updated_at`. A função existe no banco, mas **não é criada por nenhuma migration do repo do Veltzy**: `015` e `017` a usam e nunca a definiram. A migration a cria dentro de um `DO` block que não toca na versão existente, senão um banco reconstruído do zero quebra aqui. Conferir se a baseline do Hub já a define antes de manter esse bloco.

### 2.2 `supabase/functions/_shared/gcal.ts` (novo)

Módulo compartilhado. É a costura que permite migrar para o Hub depois trocando só o corpo deste arquivo.

**`getValidAccessToken(supabase, profileId): Promise<{ accessToken, calendarId }>`**

Lê a conexão. Se `token_expires_at` vence em menos de 60 segundos, renova em `POST https://oauth2.googleapis.com/token` com `grant_type=refresh_token`, persiste `access_token` e `token_expires_at`, e devolve o novo. Em resposta `invalid_grant` (usuário revogou o acesso no Google), grava `is_active=false` e `last_error`, e lança `GcalAuthError`.

Os dois casos de ausência são **distintos**, e confundi-los torna o terceiro estado do card inalcançável:

- **Sem linha nenhuma** (nunca conectou) lança `GcalNotConnectedError`, e o vendedor lê "conecte sua agenda".
- **Linha com `is_active=false`** (conectou e o acesso morreu) lança `GcalAuthError`, e o vendedor lê "reconecte".

**`createEvent(accessToken, calendarId, event)`**

`POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?sendUpdates=all`

O `sendUpdates=all` é o que faz o Google enviar o email de convite ao cliente. Sem ele o evento nasce mudo. Retorna o `id` do evento, que vira `tasks.google_event_id`.

**`patchEvent`, `deleteEvent`** com o mesmo `sendUpdates=all`. Ficam prontos aqui, mas só são chamados na Onda 2.

**`buildEventFromTask(task, leadName)`** monta o corpo:

| Campo Google | Origem |
|---|---|
| `summary` | `task.title` |
| `description` | `task.description` |
| `start.dateTime` | `task.meeting_date` |
| `end.dateTime` | `meeting_date` mais `meeting_duration` (default 60 min) |
| `start.timeZone` / `end.timeZone` | `'America/Sao_Paulo'`, fixo |
| `attendees` | `[{ email: task.meeting_lead_email, displayName: leadName }]` |
| `location` | `task.meeting_link`, quando houver |

### 2.3 `supabase/functions/gcal-oauth/index.ts` (novo)

Cópia estrutural de `instagram-oauth/index.ts`: valida `Authorization: Bearer`, resolve o profile pelo `user.id`, e só então instancia o client com service role. Mesmo formato de CORS e de resposta de erro.

**`action: 'authorize'`** devolve a URL de consentimento:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id={GOOGLE_CLIENT_ID}
  &redirect_uri={APP_URL}/oauth/google/callback
  &response_type=code
  &scope=https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email
  &access_type=offline
  &prompt=consent
  &state={nonce}
```

`access_type=offline` e `prompt=consent` são obrigatórios juntos. Sem os dois o Google não devolve `refresh_token`, e a conexão morre na primeira expiração, uma hora depois.

**`action: 'callback'`** recebe `{ code, state }`, troca em `POST https://oauth2.googleapis.com/token`, lê o email em `GET https://www.googleapis.com/oauth2/v3/userinfo`, e faz upsert por `profile_id` com `is_active=true` e `last_error=null`.

**`action: 'disconnect'`** chama `POST https://oauth2.googleapis.com/revoke?token={refresh_token}` e apaga a linha. Falha na revogação não impede o delete local.

Proteção CSRF: o front gera um nonce aleatório, guarda em `sessionStorage`, envia no `state` e confere na volta antes de chamar `callback`.

### 2.4 `supabase/functions/calendar-event/index.ts` (novo)

Substitui a fantasma `create-calendar-event`. **Recebe `{ action: 'create', taskId }` e nada mais.** A função lê a tarefa em `veltzy.tasks` com service role, resolve `assigned_to`, chama `_shared/gcal.ts` e grava `google_event_id` de volta na tarefa.

O cliente nunca envia token nem conteúdo de evento. Isso corrige o vazamento do desenho antigo, em que `tasks.service.ts:139` lia `access_token` e `refresh_token` no browser e os passava no corpo da chamada.

Respostas:

| Situação | HTTP | Corpo |
|---|---|---|
| Sucesso | 200 | `{ eventId }` |
| Vendedor sem conexão | 200 | `{ skipped: 'not_connected' }` |
| Token revogado | 200 | `{ skipped: 'auth_expired' }` |
| Google recusou (email inválido, etc.) | 200 | `{ skipped: 'provider_error', message }` |

Todos com 200 de propósito: falta de calendário não é erro de sistema, é estado do usuário, e precisa chegar ao front como informação em vez de exceção.

## 3. Frontend

### 3.1 Arquivos novos

**`src/services/google-calendar.service.ts`** com `getConnection`, `startAuthorization`, `completeCallback`, `disconnect`. Invoca `gcal-oauth` via `supabase.functions.invoke`.

**`src/hooks/use-google-calendar.ts`** com `useGoogleCalendarConnection` (query), `useConnectGoogleCalendar` e `useDisconnectGoogleCalendar` (mutations com toast), no padrão de `use-tasks.ts:52`.

**`src/pages/oauth-google-callback.tsx`**: lê `code` e `state` da query string, confere o nonce contra o `sessionStorage`, chama `completeCallback`, mostra estado de carregando, e redireciona para `/minha-conta?tab=integracoes` com toast. Reaproveita o `PageLoadingSkeleton` de `src/components/shared/`.

**`src/components/settings/google-calendar-card.tsx`**: três estados visuais, desconectado (botão Conectar), conectado (mostra `google_email` e botão Desconectar), e precisa reconectar (quando `is_active=false`, exibe `last_error` e botão Reconectar).

**`src/components/inbox/schedule-meeting-dialog.tsx`**: o diálogo do fluxo principal, descrito em 3.3.

### 3.2 Arquivos alterados, fora do inbox

**`src/App.tsx`**: rota `/oauth/google/callback` dentro da área autenticada, junto das rotas a partir de `:88`.

**`src/pages/minha-conta.tsx`**: quinta aba `Integracoes`, montando o card. O `TabsList` já tem `flex-wrap h-auto gap-1` (`:17`), então o quinto gatilho quebra linha em vez de estourar; não precisa de defesa nova.

**`src/components/admin/integrations-tab.tsx:326`**: troca o `HubManagedCard` decorativo por um card que explica que a conexão é por vendedor e aponta para Minha Conta.

### 3.3 O diálogo de agendamento

Campos, todos pré-preenchidos com o que o sistema já sabe:

| Campo | Origem do valor inicial | Obrigatório |
|---|---|---|
| Título | `Reunião com {leadDisplayName(lead.name, lead.phone)}` | Sim |
| Data e hora | vazio, `<Input type="datetime-local">` como em `create-task-modal.tsx:360` | Sim |
| Duração | 60 minutos | Sim |
| Email do cliente | `lead.email` | Sim |
| Link da reunião | vazio | Não |
| Descrição | vazio | Não |
| Enviar confirmação no WhatsApp | marcado | - |

Validação com zod mais react-hook-form, no padrão do `create-task-modal.tsx:54`.

**Ao confirmar, nesta ordem:**

1. Se o email digitado difere de `lead.email`, grava em `leads.email` via `useUpdateLead` (`use-leads.ts:46`). É assim que a base de emails melhora com o uso.
2. Cria a tarefa via `createTask` com `type: 'meeting'`, `lead_id`, `assigned_to` do vendedor logado, `meeting_date`, `meeting_duration`, `meeting_lead_email`, `meeting_link`, e `due_date` espelhando `meeting_date` (o espelho já é feito em `create-task-modal.tsx:204`; manter a coerência).
3. Invoca `calendar-event` com `{ action: 'create', taskId }`.
4. Se a caixa de confirmação estiver marcada, envia mensagem na conversa via `useSendMessage` (`use-messages.ts:64`), com data e hora formatadas em pt-BR.
5. Fecha e mostra o resultado conforme a tabela abaixo.

**Retorno visível ao vendedor:**

| Resposta de `calendar-event` | O que aparece |
|---|---|
| `{ eventId }` | Toast de sucesso: convite enviado para o email do cliente |
| `skipped: 'not_connected'` | Toast de aviso: reunião salva, Google Agenda não conectado, com atalho para Minha Conta |
| `skipped: 'auth_expired'` | Toast de aviso: reunião salva, é preciso reconectar o Google |
| `skipped: 'provider_error'` | Toast de aviso: reunião salva, convite não enviado, com a mensagem do Google |

Em todos os casos **a tarefa foi criada**. O aviso é sobre o convite, não sobre a reunião.

Se o vendedor não tem Google conectado, o diálogo já abre mostrando esse estado no topo, para ele saber antes de preencher.

### 3.4 O gatilho na barra de composição, e a medição que ele exige

O gatilho é um botão de ícone (`CalendarPlus`, `h-8 w-8`) na barra de "Digite uma mensagem", ao lado dos três existentes em `chat-input.tsx:121-147`: templates (`reply-templates-popover.tsx:28`), anexo (`:127-136`) e áudio (`audio-recorder.tsx:172`). Todos são `h-8 w-8`; o botão de enviar é `h-10 w-10` (`:169`).

**A barra não comporta um quarto ícone a 360px.** Orçamento medido pelo método das fases de responsividade (`text-sm` a 7,3px por caractere):

```
360   viewport
-24   p-3 nas duas bordas do container
-32   templates (h-8 w-8)
-32   anexo (h-8 w-8)
-32   áudio (h-8 w-8)
-40   enviar (h-10 w-10)
-32   quatro gaps de gap-2
----
168px sobram hoje para o textarea
-24   px-3 do próprio textarea
----
144px de área útil de texto hoje
```

O placeholder "Digite uma mensagem..." tem 22 caracteres, ou seja 161px. **Ele já está cortado hoje**, em cerca de 12%. Com um quarto ícone (32px mais um gap de 8px) a área útil cai para **104px**, e o placeholder passa a pedir 54% a mais do que cabe. Pelos limiares que viemos usando, acima de 20% é quebra confirmada.

**Decisão: agrupar em mobile, expandir em desktop.**

- A partir de `sm` (640px), os quatro ícones aparecem em linha, como pedido.
- Abaixo de `sm`, templates, anexo e agendar colapsam atrás de um único gatilho `Plus` (`h-8 w-8`) que abre um `Popover` com as três ações rotuladas. Áudio, textarea e enviar permanecem sempre visíveis, porque áudio é ação de um toque e os outros dois são o caminho principal.

O saldo a 360px passa a ser:

```
360 - 24 (p-3) - 32 (Plus) - 32 (áudio) - 40 (enviar) - 24 (3 gaps) = 208px para o textarea
```

São **208px contra os 168px de hoje**. O agrupamento não é só o preço de caber o botão novo: ele devolve 40px ao campo de digitação e resolve o placeholder cortado que já existia antes desta feature.

O `Popover` reaproveita o padrão de `reply-templates-popover.tsx`. As três ações aparecem com rótulo, não só ícone, o que também melhora a descoberta em mobile.

**Armadilha para quem mexer nisso depois.** Os 208px só fecham porque `ReplyTemplatesPopover` retorna **ou** o Button **ou** o painel absoluto, sem elemento em volta. É isso que faz o `hidden` do gatilho virar `display:none` e sair do fluxo flex sem consumir gap. Envolver o componente num `<div>` "para organizar" devolve um flex item de largura zero que come 8px de `gap-2`: a conta cai para 200px, o placeholder volta a cortar, e **nada quebra visivelmente**. Por isso o wrapper que existia no `chat-input.tsx` foi removido, e não deve voltar.

Nada em `chat-header.tsx` muda.

## 4. Limpeza de `src/services/tasks.service.ts`

**Apagar o bloco `:134-163` inteiro.** São três defeitos em trinta linhas: chama função que não existe, lê colunas que provavelmente não existem em `oauth_integrations` (todos os outros seis consumidores da tabela usam apenas `id, company_id, provider, status, metadata`, e a migration `032` documenta que credenciais moram em `metadata`), e trafega token pelo browser.

No lugar, `createTask` passa a devolver a tarefa criada e nada mais. **Quem chama `calendar-event` é o diálogo**, no passo 3 de 3.3, e não o service. Motivo: só o inbox tem o contexto do que fazer com a resposta, e embutir isso no service reintroduziria o silêncio que estamos removendo.

Nada mais de `tasks.service.ts` muda nesta onda. `updateTask`, `deleteTask` e `updateTaskStatus` só ganham sincronização na Onda 2.

## 5. LGPD

A feature trata dado pessoal em três frentes, e cada uma precisa de base legal declarada.

| Dado | Frente | Base legal | Onde vive |
|---|---|---|---|
| Email do lead | Enviado ao Google, que dispara o convite em nome da empresa | Execução de contrato (é a funcionalidade contratada) e legítimo interesse do vendedor em agendar | `leads.email`, e em trânsito para a API do Google |
| Nome do lead | Vai como `displayName` no convite | Idem | `leads.name` |
| Tokens OAuth do vendedor | Credencial de acesso à agenda pessoal dele | Consentimento, dado explicitamente na tela do Google | `google_calendar_connections` |
| Email Google do vendedor | Identifica a conta conectada na UI | Consentimento | `google_calendar_connections.google_email` |

**Compartilhamento com operador e transferência internacional.** O Google passa a ser operador para o envio do convite, e o tratamento ocorre fora do Brasil. Os dois pontos precisam constar da Política de Privacidade, na lista de operadores e na cláusula de transferência internacional. Se a Política não menciona o Google Agenda hoje, atualizá-la é **pré-requisito de rollout**, não tarefa posterior.

**Minimização.** Só saem para o Google os campos necessários ao convite: título, descrição, horário, link e o par nome/email do lead. Nada de telefone, tags, valor de negócio, temperatura ou histórico de conversa.

O telefone é o caso que exige atenção, porque ele chega ao Google por dois caminhos que não passam pelo `buildEventFromTask`, os dois quando o lead **não tem nome**:

- `attendees[].displayName`, se o fallback for `lead.phone`. Correção: omitir `displayName` quando não há nome, e deixar o Google exibir o email.
- O título sugerido, se vier de `leadDisplayName`, que devolve o telefone cru para número brasileiro de 13 dígitos. Correção: o default sem nome é `Reunião`, sem sufixo.

**A regra geral, que vale além desta feature:** `leadDisplayName` (`src/lib/phone.ts:14`) é **correto para exibição interna e impróprio como fonte de dado que sai do produto**. Dentro do Veltzy, mostrar o telefone quando falta o nome é o comportamento certo. Atravessando para um sistema externo, vira dado pessoal a mais sem finalidade. Qualquer integração futura que exporte identificação de lead precisa fazer essa distinção.

**Consentimento do vendedor.** É a própria tela de permissão do Google, que é registro válido e revogável a qualquer momento em `myaccount.google.com/permissions`. O card em Minha Conta oferece a revogação pelo lado de cá, e o `disconnect` chama o endpoint de revoke do Google além de apagar a linha. Não é preciso tabela de consentimento própria para isso.

**O lead não consente com o convite, e isso é correto.** Ele recebe o convite porque há relação comercial em andamento, na mesma base legal pela qual o vendedor já conversa com ele por WhatsApp. Não é comunicação de marketing e não exige opt-in. Se um dia a feature virar disparo em massa, essa leitura muda e precisa ser refeita.

**Segurança do token.** Tokens são credenciais: RLS restrita à própria linha (seção 2.1), nunca legíveis por colega de empresa, nunca trafegando pelo frontend (seção 2.4), e `GOOGLE_CLIENT_SECRET` só em Supabase Secrets.

**Exclusão.** `google_calendar_connections` tem `ON DELETE CASCADE` a partir de `profiles`, então desligar o vendedor apaga os tokens dele. Eventos já criados na agenda do vendedor **não** são apagados, e não devem ser: pertencem à agenda dele, não ao Veltzy.

## 6. Arquivos afetados

**No repo do Hub (1):** a migration da seção 2.1.

**Novos neste repo (8):** `_shared/gcal.ts`, `gcal-oauth/index.ts`, `calendar-event/index.ts`, `google-calendar.service.ts`, `use-google-calendar.ts`, `oauth-google-callback.tsx`, `google-calendar-card.tsx`, `schedule-meeting-dialog.tsx`.

**Alterados (5):** `App.tsx`, `minha-conta.tsx`, `integrations-tab.tsx`, `chat-input.tsx`, `tasks.service.ts`.

`chat-input.tsx` é o único que carrega risco de regressão visual, porque a mudança de 3.4 reorganiza a barra de composição inteira, não só acrescenta um botão.

## 7. Verificação

### 7.1 Automática

```bash
npx tsc --noEmit
npm run lint      # comparar com baseline do merge-base
npm run build
npm test
```

Baseline do lint: `git checkout --detach $(git merge-base develop HEAD)`, roda, anota, volta. **Nunca `git stash`**, que não alcança o que já foi commitado e produz um "0 novos" falso.

Três greps que devem passar:

```bash
grep -rn "create-calendar-event" src/ supabase/     # vazio
grep -rn "access_token" src/services/ src/hooks/    # vazio, token nenhum no front
grep -rn "sendUpdates" supabase/functions/_shared/gcal.ts   # presente nas três chamadas

# minimização: o telefone não alcança o caminho do Google por nenhuma via
grep -rn "phone" supabase/functions/_shared/gcal.ts \
  supabase/functions/calendar-event/index.ts \
  src/components/inbox/schedule-meeting-dialog.tsx    # vazio
```

O último prova ausência de uma via de vazamento, não ausência de vazamento. Ele fecha o caminho conhecido; quem confirma o resto é o passo 3 da verificação manual.

### 7.2 Manual, ponta a ponta

Exige conta Google real cadastrada como usuário de teste. Emulador não substitui nenhum destes passos.

1. Minha Conta > Integrações > Conectar. Consentir. Voltar e ver o email no card.
2. No inbox, abrir uma conversa e clicar em agendar. Conferir que título e email vêm preenchidos.
3. Confirmar. Verificar, nesta ordem: o evento aparece na agenda do vendedor no horário certo de São Paulo; **o cliente recebe o convite por email**, com aceitar e recusar; a mensagem de confirmação aparece na conversa.

   Este passo é também **a conferência de minimização da seção 5**, e é a única que vale de verdade: olhar o convite recebido e confirmar que não há nada além de título, descrição, horário, link e o par nome/email. Os greps de 7.1 fecham as vias conhecidas; só o convite real mostra o que de fato saiu.

   Repetir com um **lead sem nome preenchido**, que é o caso onde o telefone vazava pelos dois caminhos corrigidos: o título deve ser `Reunião`, e o participante deve aparecer pelo email, nunca por número.
4. No banco, conferir que a tarefa nasceu com `type='meeting'` e `google_event_id` preenchido.
5. Abrir `/tarefas` e ver a reunião lá, com os lembretes gerados.
6. Agendar para um lead **sem email**: o campo vem vazio, é exigido, e depois de confirmar o email aparece gravado no painel de contato.
7. Com um vendedor **sem Google conectado**: a tarefa é criada, o toast avisa, e o atalho leva a Minha Conta.
8. Revogar o acesso em myaccount.google.com e agendar de novo: tarefa criada, toast de reconectar, card em estado de erro.
9. Desconectar pelo card e conferir que a linha sumiu da tabela.

### 7.3 Responsividade e não regressão

10. Barra de composição a **360px em aparelho real**: o gatilho `Plus` abre o popover com as três ações rotuladas, o placeholder aparece inteiro (é o ganho de 40px medido em 3.4), e áudio, textarea e enviar continuam acessíveis sem rolagem horizontal.
11. A mesma barra a 640px ou mais: os quatro ícones em linha, sem `Plus`, e o textarea sem aperto.
12. Gravar um áudio ainda esconde os demais controles como antes (`isRecording` em `:121` e `:149`). Este é o caminho mais fácil de quebrar ao mexer na barra.
13. Enviar anexo e usar template seguem funcionando pelos dois caminhos, agrupado e em linha.
14. Tarefas dos tipos `todo`, `followup` e `call` não tocam em calendário.
15. O cron `send-task-reminders` segue funcionando para reuniões criadas pelo inbox.

## 8. Fora de escopo da Onda 1

Sincronização de edição e cancelamento (Onda 2, que exige tornar `meeting_date` editável, hoje impossível porque `edit-task-modal.tsx:183` só edita `due_date`). Consulta de disponibilidade. Sentido Google para Veltzy. Agenda da empresa. Tool `schedule_meeting` do SDR. Migração do OAuth para o Hub.

## 9. Pendências registradas

1. O schema real de `public.oauth_integrations` não foi confirmado: a tabela não é criada por nenhuma migration do repo, é da era Lovable. Esta onda a contorna com tabela dedicada, mas a dúvida continua aberta para quem for mexer em WhatsApp.
2. `supabase/functions/instagram-oauth/index.ts` parece órfão: a UI mostra Instagram como gerenciado pelo Hub e não há tela que chame essa função. Confirmar e remover, ou religar.
3. O placeholder cortado da barra de composição a 360px é **anterior a esta feature** e passou pelas seis fases de responsividade sem ser detectado, porque a varredura olhou quebra de layout e não texto truncado dentro de campo. Vale considerar se o critério de aceite da frente de responsividade deveria incluir placeholders.
4. A verificação do app no Google é externa e lenta. Enquanto não sair, a feature vive limitada a 100 usuários de teste.

5. **Bug pré-existente, fora desta onda: reuniões criadas por `/tarefas` têm 3 horas de erro.** `create-task-modal.tsx:209` grava `values.meeting_date` cru do `<input type="datetime-local">`, que não carrega offset. O Postgres casta usando a timezone da sessão, UTC no Supabase, então 14:00 digitado é gravado como 14:00 UTC e reexibido como 11:00 em BRT. O mesmo vale para o `due_date` espelhado em `:204`. O diálogo do inbox converte com `toISOString()` antes de gravar e não sofre disso.

   Confirmado por leitura do código, **não verificado em banco**. O critério que decide: abrir uma reunião existente em `/tarefas` e comparar o horário exibido com o que foi digitado na criação. Se confirmar, tem lado de correção de dados já gravados, não só de código.

6. A remoção do wrapper `<div className="relative">` de `chat-input.tsx` mudou a ancoragem do painel de templates: ele passou a se posicionar pela barra inteira em vez de pelo botão. Efeito visual quase idêntico, porque o gatilho já era o item mais à esquerda, e em mobile é a única opção, já que não há gatilho. Registrado porque é mudança de ancoragem, e merece um olho na verificação visual.
