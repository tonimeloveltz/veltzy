# PRD: Google Calendar, convite de reunião a partir do Inbox

> Feature: `google-calendar` / Onda 1
> Status: Em revisão
> Data: 2026-08-05
> Branch: `feat/google-calendar-convite-inbox`

---

## 1. Problema e contexto de negócio

O vendedor conversa com o lead no WhatsApp, chegam a um acordo sobre o horário, e aí o fluxo quebra. Ele sai do Veltzy, abre o Google Agenda, cria o evento na mão, digita o email do cliente de memória ou copiando de outra aba, e volta. O convite, quando chega, não tem relação nenhuma com o CRM: não vira tarefa, não gera lembrete, não aparece no funil.

O custo disso não é o minuto perdido, é o que se perde no caminho. Reunião combinada no chat e não agendada em lugar nenhum é reunião que o vendedor esquece e o gestor não vê. E quando é agendada por fora, o Veltzy deixa de saber que existe.

**O que esta entrega resolve:** o vendedor agenda a reunião sem sair da conversa, e o cliente recebe o convite no email dele, com a reunião já registrada no CRM.

## 2. Estado atual

Existe preparação de abril/2026 que nunca funcionou. Ela veio do commit `bd290b1` ("Calendar prep"), e a auditoria de 28/abr registrou o buraco como gap 3.1, fechado no `4c21271` com "já tratado pelo try/catch", ou seja, mandado para o backlog. O resumo do que ficou:

| Peça | Onde | Estado |
|---|---|---|
| Coluna `google_event_id` | `veltzy.tasks`, migration `015` | Existe, nunca escrita nem lida |
| Chamada de sincronização | `tasks.service.ts:134-163` | Invoca `create-calendar-event`, que **não existe** |
| Leitura de credenciais | `tasks.service.ts:139` | Pede colunas que provavelmente não existem em `oauth_integrations`, e lê token no browser |
| Card em Admin > Integrações | `integrations-tab.tsx:326` | Decorativo, sem botão e sem estado |
| OAuth do Google | Nenhum lugar | Não existe, nem na Veltzy nem no Hub |

Nada disso é aproveitável como está. O que se aproveita é o **módulo Tarefas**, que já tem os campos de reunião (`meeting_date`, `meeting_duration`, `meeting_link`, `meeting_lead_email`), lembretes automáticos por WhatsApp e email via cron `send-task-reminders`, e tela própria em `/tarefas`.

E se aproveita o `leads.email`, que já existe (`database.ts:225`) e já é editável no painel de contato do inbox (`contact-panel.tsx:299`).

## 3. Decisões de arquitetura (locked)

**D1. O OAuth mora na Veltzy, não no Hub.** O PRD do SDR v2 coloca `gcal-*` no Hub, mas o Hub não tem nada disso construído, e construir lá está fora deste repo. A Veltzy já tem precedente de OAuth próprio em `supabase/functions/instagram-oauth/index.ts`, que é o molde. Um módulo `_shared/gcal.ts` isola a chamada, para que migrar ao Hub depois seja trocar o corpo de um arquivo.

**D2. A agenda é do vendedor, não da empresa.** Cada usuário conecta a própria conta Google em Minha Conta. O evento nasce na agenda de quem está atendendo. Reunião de venda pertence ao vendedor, e é a agenda dele que precisa mostrar conflito de horário.

**D3. Quem envia o email de convite é o Google, não a Veltzy.** Ao criar o evento com o lead em `attendees` e o parâmetro `sendUpdates=all`, o próprio Google dispara o convite para o email do cliente, com botões de aceitar e recusar, e cria o evento na agenda dele se for Gmail. A Veltzy não constrói envio de email, não usa Brevo para isso e não monta template.

**D4. O registro no CRM é uma tarefa do tipo reunião.** O agendamento pelo inbox cria uma linha em `veltzy.tasks` com `type='meeting'`, e não um objeto novo. Assim a reunião herda de graça os lembretes, a tela `/tarefas`, o vínculo com o lead e o `google_event_id`. O inbox vira um gatilho a mais para a mesma coisa, não um caminho paralelo.

**D5. Token nunca transita pelo cliente.** O front manda o `taskId`; a Edge Function lê a tarefa, resolve a conexão do vendedor e chama o Google. Isso corrige o vazamento do desenho antigo.

## 4. Fluxo do usuário

### 4.1 Conectar a conta (uma vez por vendedor)

Minha Conta ganha um card "Google Agenda". Conectar abre o consentimento do Google, volta para `/oauth/google/callback`, e o card passa a mostrar o email conectado e um botão de desconectar.

### 4.2 Agendar durante a conversa

1. No inbox, com a conversa aberta, o vendedor clica no botão de agendar na barra de "Digite uma mensagem", ao lado dos ícones de template, anexo e áudio. O gatilho fica onde a mão já está durante a conversa.
2. Abre um diálogo já preenchido com o que o sistema sabe: título sugerido a partir do nome do lead, duração 60 minutos, e o email do lead vindo de `leads.email`.
3. O vendedor escolhe data e hora, confere o email e confirma.
4. A Veltzy cria a tarefa, cria o evento na agenda do vendedor e pede ao Google que envie o convite.
5. O cliente recebe o convite no email. O vendedor vê a confirmação na tela.
6. Opcionalmente, uma mensagem de confirmação é enviada na própria conversa do WhatsApp, com data e hora.

### 4.3 O que acontece quando falta alguma coisa

| Situação | Comportamento |
|---|---|
| Lead sem email | O campo vem vazio e é obrigatório. Ao confirmar, o email digitado é gravado em `leads.email`, então só se pede uma vez |
| Vendedor sem Google conectado | O diálogo mostra o estado de não conectado e leva para Minha Conta. A reunião ainda pode ser criada como tarefa, sem convite |
| Token expirado ou revogado | A tarefa é criada, aparece aviso de que o convite não foi enviado, e o card em Minha Conta entra em estado de reconectar |
| Email inválido | O Google recusa. A tarefa permanece, o erro aparece na tela |

O princípio: **a tarefa nunca se perde por causa do calendário**. Falha de integração vira aviso visível, nunca silêncio. Esse é o defeito central do código atual, onde um `catch` vazio engole tudo.

## 5. Modelo de dados

**Tabela nova:** `public.google_calendar_connections`, uma linha por profile, guardando `access_token`, `refresh_token`, `token_expires_at`, `google_email`, `calendar_id`, `is_active` e `last_error`. Modelada em `public.instagram_connections` (`007_admin_superadmin.sql:20`), porém com RLS mais estrita: o vendedor lê apenas a própria linha, porque token é credencial e não deve ser legível por colegas de empresa.

A migration que cria essa tabela **nasce no repo do Hub**, não no do Veltzy, porque o Hub é dono do histórico de migrations do banco Central. Detalhe na seção 2.1 da Spec.

**Tabela existente:** `veltzy.tasks` não muda de schema. Passa a ter `google_event_id` efetivamente preenchido.

**Campo existente:** `leads.email` passa a ser escrito também pelo diálogo de agendamento.

## 6. LGPD

A feature trata dado pessoal em três frentes, e o mapeamento completo, com RLS e política por tabela, está na seção 5 da Spec. O que importa em nível de produto:

**O email do lead passa a sair do Veltzy para o Google**, que envia o convite em nome da empresa. Isso é compartilhamento com operador e transferência internacional, nas duas hipóteses cobertas pela base de execução de contrato, já que agendar a reunião é a funcionalidade contratada. **A Política de Privacidade precisa citar o Google Agenda** na lista de operadores e na cláusula de transferência internacional. Se hoje não cita, atualizar é pré-requisito de rollout, não tarefa posterior.

**Só saem os campos necessários ao convite:** título, descrição, horário, link e o par nome e email do lead. Telefone, tags, valor de negócio, temperatura e histórico de conversa não são enviados.

**O consentimento do vendedor é a própria tela do Google**, que é registro válido e revogável tanto de lá quanto pelo card em Minha Conta. Não exige tabela de consentimento própria.

**O lead não consente com o convite, e está correto.** Ele o recebe porque há relação comercial em andamento, na mesma base pela qual o vendedor já conversa com ele por WhatsApp. Não é marketing e não exige opt-in. Se a feature um dia virar disparo em massa, essa leitura muda e precisa ser refeita.

## 7. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Escopo `calendar.events` é sensível no Google. Sem verificação do app, só funciona para test users cadastrados (limite 100) e exibe aviso de app não verificado | Bloqueia rollout geral, não bloqueia piloto | Iniciar a verificação assim que o OAuth client existir. O processo leva semanas e roda em paralelo ao desenvolvimento |
| Vendedor não conecta a conta e a feature morre por desuso | Alto | Card visível em Minha Conta e estado explícito no diálogo. Medir taxa de conexão |
| Base de leads com pouco email preenchido | Médio | O diálogo captura e persiste, então a base melhora com o uso |
| Quarto ícone na barra de composição estoura em tela estreita | Médio | Medido: a 360px o campo de texto já perde para o placeholder hoje, e um quarto ícone piora em 54%. A Spec resolve agrupando templates, anexo e agendar atrás de um `Plus` abaixo de 640px, o que devolve 40px ao campo |

## 8. Ondas

**Onda 1 (esta entrega).** OAuth por vendedor, card em Minha Conta, botão e diálogo de agendamento no inbox, criação de tarefa mais evento com convite, avisos de falha visíveis.

**Onda 2.** Sincronização de edição e cancelamento: mover ou cancelar a reunião na Veltzy reflete no Google. Exige tornar `meeting_date` editável, que hoje não é: `edit-task-modal.tsx` só edita `due_date`.

**Onda 3.** Consulta de disponibilidade (oferecer horários livres em vez de digitar), e a tool `schedule_meeting` do SDR IA, que passa a usar a mesma infraestrutura.

## 9. Métricas de sucesso

- Vendedores com conta Google conectada, sobre o total de vendedores ativos.
- Reuniões agendadas pelo inbox, sobre o total de reuniões criadas no Veltzy.
- Convites aceitos, sobre convites enviados.
- Reuniões com `google_event_id` preenchido, que mede se a integração de fato completa o ciclo.

## 10. Fora de escopo

Sincronização no sentido Google para Veltzy (webhook push ou polling). Agenda compartilhada da empresa. Consulta de disponibilidade e sugestão de horários. Criação automática de link do Meet como recurso obrigatório. Outros calendários além do Google. Migração do OAuth para o Hub. Tool `schedule_meeting` do SDR.
