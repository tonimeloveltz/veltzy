# SPEC: Nome e sobrenome, ajustes (rodada 2)

Trilha: M
Início: 2026-11-03 16:20
Merge: (preencher no merge)

Referência: `specs/nome-sobrenome/SPEC.md` (colunas `first_name`/`last_name`, trigger `sync_name_parts`, `renderMessageBody` com `{{nome}}` = primeiro nome). Sem schema, sem Hub.

## Contexto
- **Automações** (`run-automations`): ações `send_message` (insere em `messages`) e `send_whatsapp` (enfileira em `message_queue`) gravam `actionData.message` cru: `{{nome}}` vaza literal. O lead já é lido com `select('*')`. A UI (`automation-rule-modal.tsx`) só cria `send_message`, num campo único "Valor da acao".
- **Lembretes de reunião** (`sdr-ai`, modo `meeting-reminders`): causa raiz do nome completo. O único chamador é `src/components/tarefas/create-task-modal.tsx`, que manda `leadName = lead.name || lead.phone` (lead de `useLeadsSimple`, select `id, name, phone, email`). O `leadName` é usado no prompt e nos fallbacks (servidor e client): o lembrete sai com o nome completo, ou com o telefone quando o lead não tem nome.
- **Export** (`src/lib/export-leads.ts`): coluna única `Nome` = `name`. O modelo de importação idem. No import, `nome completo` já era auto-mapeado para `name`, e a ordem das colunas decidia qual header ficava com o campo.
- `/deals` exporta a partir do embed `leads:lead_id(...)` de `deals.service.ts`, que não trazia `first_name`/`last_name`.

## O que entra / o que não entra
Entra: R1 render nas automações + dica na UI; R2 primeiro nome nos lembretes; R3 export/modelo com Sobrenome e reimport.
Não entra: `notify_team` (notificação interna, não vai ao lead); texto do prompt do SDR conversacional; PDF (segue com nome completo).

## Arquivos
<!-- arquivos -->
specs/nome-sobrenome-ajustes/SPEC.md
supabase/functions/run-automations/index.ts
src/components/admin/automation-rule-modal.tsx
supabase/functions/sdr-ai/index.ts
src/components/tarefas/create-task-modal.tsx
src/lib/lead-name.ts
src/lib/lead-name.test.ts
src/lib/export-leads.ts
src/lib/export-leads.test.ts
src/lib/csv-parser.ts
src/lib/csv-parser.test.ts
src/services/deals.service.ts
src/types/database.ts
<!-- /arquivos -->

## O que fazer em cada arquivo
### R1
- `run-automations/index.ts`: `send_message` e `send_whatsapp` passam `actionData.message` por `renderMessageBody(String(... ?? ''), lead)`.
- `automation-rule-modal.tsx`: com ação "Enviar mensagem", dica de variáveis igual à do wizard de campanha.

### R2
- `create-task-modal.tsx`: `useLeadsSimple` passa a trazer `first_name`; `generateReminders(task, leadName, greetName)` com `greetName = leadGreetingName(lead)`; manda `leadFirstName` ao `sdr-ai`; fallbacks do client usam `greetName || 'cliente'`. Telefone não é mais mandado como nome.
- `src/lib/lead-name.ts` (novo): `leadGreetingName(lead)` = `first_name`, senão 1ª palavra do `name`, senão `''`; placeholder (`Contato ...`, só telefone, vazio) nunca vira saudação.
- `sdr-ai/index.ts`: lê `leadFirstName`; `firstNameForGreeting(leadFirstName, leadName)` com a mesma regra e fallback `'cliente'` (cobre chamador antigo sem `leadFirstName`). Prompt mantém `Lead: <nome completo>` como contexto e ganha a linha "Como chamar o lead nas mensagens: <primeiro nome> (so o primeiro nome)". Fallbacks sem IA usam o primeiro nome.

### R3
- `export-leads.ts`: `EXPORT_HEADERS` = `Nome`, `Sobrenome`, `Nome completo`, `Telefone`, ...; `exportNameColumns(l)`; `TEMPLATE_HEADERS` com `Sobrenome` logo após `Nome` e exemplo `João` / `Silva`.
- `csv-parser.ts`: `nome completo` e `contact name` viram `NAME_FALLBACK_HEADERS`: só mapeiam para `name` numa segunda passada, se nenhum header de Nome ocupou o campo (independe da ordem das colunas).
- `deals.service.ts` + `types/database.ts` (`DealWithLead.leads`): embed do lead ganha `first_name, last_name`, para o export de `/deals` sair com as colunas certas.

## Contratos não óbvios
```ts
// sdr-ai, body do modo meeting-reminders
{ mode: 'meeting-reminders', leadName: string, leadFirstName?: string, meetingDate: string, meetingLink: string }

// export-leads
exportNameColumns(l) => [Nome, Sobrenome, NomeCompleto]
// first_name presente: [first_name, last_name ?? '', name]
// first_name nulo/ausente: [name, '', name]
```

## Critérios de aceite
- [ ] Automação "Enviar mensagem" com `Oi {{nome}}` grava `Oi Maria` em `messages`; `send_whatsapp` idem na `message_queue`.
- [ ] Dica de variáveis aparece no modal de automação com a ação "Enviar mensagem".
- [ ] Reunião criada para `Maria Aparecida Souza`: lembretes (IA e fallback) saúdam "Maria"; lead sem nome ou só telefone: "cliente".
- [ ] Export (contatos, pipeline e `/deals`): colunas Nome (primeiro nome), Sobrenome, Nome completo; placeholder sai com Nome = name.
- [ ] Modelo de importação tem Sobrenome logo após Nome.
- [ ] Reimportar um export: Nome → `name` (vira first_name), Sobrenome → `last_name`, Nome completo ignorado. Planilha só com "Nome completo" segue mapeando para `name`.
- [ ] build, vitest e `deno check` sem erro novo nas edge tocadas; `run-automations` e `sdr-ai` deployadas no staging com `verify_jwt` mantido.

## Decisões tomadas
- R1: `send_whatsapp` também renderiza (mesmo `actionData.message`, e é o que chega ao lead), mesmo sem UI que o crie hoje.
- R1: `notify_team` não renderiza: mensagem interna para a equipe.
- R2: o primeiro nome é resolvido no client (que tem o lead) e mandado como `leadFirstName`; o servidor repete a regra só como fallback para chamador antigo. Não busca o lead no `sdr-ai` (o modo não recebe `leadId`).
- R2: o client deixa de mandar telefone como nome: "Olá 5511..." era pior que "Olá cliente".
- R2: regra de saudação igual ao split do banco (placeholder `Contato ...` e só telefone/máscara não viram nome).
- R3: Sobrenome sai vazio quando não há `first_name`, porque aí Nome já leva o `name` inteiro; preencher os dois duplicaria o sobrenome no reimport.
- R3: "Nome completo" ignorado no reimport quando há coluna Nome, em qualquer ordem (duas passadas), em vez de depender da ordem das colunas.
- R3: PDF mantém só o nome completo (relatório de leitura, não reimportável).
- R3: embed de lead em `deals.service.ts` ganha `first_name, last_name` (sem isso o export de `/deals` sairia sempre pelo fallback).
