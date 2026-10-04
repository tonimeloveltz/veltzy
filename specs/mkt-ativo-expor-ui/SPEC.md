# SPEC: Expor na UI o que o backend já tem (mkt-ativo)

Trilha: M
Início: 2026-10-03 18:00
Merge: (preencher no merge)

## Contexto

O backend do mkt-ativo já suporta três capacidades que a UI ainda não expõe. Este
bloco só liga os controles na interface — **zero mudança de backend, schema ou contrato**.

O que já existe (confirmado por leitura do código):
- **Agendamento:** `CreateCampaignInput.scheduled_at` existe em `campaigns.service.ts`;
  `createCampaign` grava `status: 'scheduled'` quando `scheduled_at` vem preenchido; a edge
  `blast-dispatch` aceita campanha `scheduled`, computa o cronograma a partir de `scheduled_at`,
  expande a `message_queue` com `scheduled_at` por item (o `process-message-queue` adia o envio)
  e marca a campanha `scheduled` se a data for futura. **Não há cron separado** — agenda-se
  criando com `scheduled_at` e chamando o dispatch normalmente (expande agora, envia depois).
- **Tags + Source na audiência:** `AudienceFilter` já tem `tags?: string[]` e `source_id?: string`;
  `countAudience` (service) e `buildAudiencePlan`/`blast-dispatch` (edge) já aplicam ambos
  (`tags` por overlap, `source_id` por igualdade). Faltam só os inputs no wizard.
- **Parada automática da cadência:** `process-cadences` cancela o run em **opt-out** e **resposta
  do lead** (sinais obrigatórios, linhas 75-111; `optOut`/`leadResponded` → decisão `cancel`).
  O comportamento é fixo no engine; falta só deixá-lo **visível** na UI (sem toggle).

Componentes/padrões reutilizados:
- `campaign-wizard.tsx` (3 etapas: 1 nome+template, 2 público+contagem, 3 variáveis+revisão+envio).
  `audienceFilter` montado via `useMemo` a partir de `temperatures`+`stageIds`; `useAudienceCount`
  recalcula ao vivo. `StageMultiSelect` (pills) é o padrão de segmentação.
- `useLeadSources()` (hook já existente) retorna as origens ativas (`id`, `name`, ...).
- `LeadTagsInput` (`src/components/pipeline/lead-tags-input.tsx`) — input de tags em chips,
  **controlado standalone** (`value: string[]` / `onChange: (tags) => void`, Enter adiciona,
  sem react-hook-form) → reutilizável direto no `useState` do wizard.
- `cadence-form.tsx` (Dialog) — form da cadência; já tem notas/labels no mesmo estilo.
- Primitivas: `Input`, `Label`, `Select`, `Button` de `@/components/ui`.

## O que entra / o que não entra

**Entra:**
- (a) Campo de **data/hora de agendamento** no wizard (etapa 3), opcional. Vazio = enviar agora;
  preenchido com data futura → cria `scheduled` e agenda. Botão vira "Agendar".
- (b) **Tags** (chips, via `LeadTagsInput`) e **Origem** (select de `lead_sources`) na segmentação
  (etapa 2), ambos opcionais, entrando no `audience_filter` e refletindo na contagem ao vivo.
- (c) **Aviso informativo** na `cadence-form`: "A cadência para automaticamente se o contato
  responder ou pedir opt-out." Texto fixo, **sem toggle** (comportamento já é do engine).

**Não entra:**
- Nenhuma migration/coluna/edge/contrato novo. Só UI.
- Catálogo de tags (não existe tabela de tags; o input é texto livre separado por vírgula).
- Edição de campanha agendada / cancelar agendamento / fila visível por horário — Onda futura.
- Multi-origem (o backend aceita `source_id` único; mantém único).
- Mudar o comportamento de parada da cadência (só torna visível).
- Edição/cancelamento de campanha agendada.

### ⚠️ Débito de compliance (campanha agendada) — Onda futura, fora deste bloco
Uma campanha agendada **congela a audiência no momento do agendamento**: o `blast-dispatch`
resolve os destinatários e expande a `message_queue` na hora (checando opt-out só ali). O
`process-message-queue` **NÃO re-checa `marketing_opt_out`** no envio diferido (confirmado por
leitura). Logo, quem pedir opt-out *depois* do agendamento e *antes* do envio ainda pode receber.
Mitigar numa Onda futura (re-check de opt-out no `process-message-queue` ou na expansão tardia).
Este bloco só expõe o agendamento; não corrige o débito.

## Arquivos
<!-- arquivos -->
src/components/campanhas/campaign-wizard.tsx
src/components/cadencias/cadence-form.tsx
<!-- /arquivos -->

## O que fazer em cada arquivo

1. **`src/components/campanhas/campaign-wizard.tsx`** (mod)
   - **Imports:** `useLeadSources` de `@/hooks/use-lead-sources`; `LeadTagsInput` de
     `@/components/pipeline/lead-tags-input`.
   - **Estado novo:** `scheduledAt: string` (valor de `<input type="datetime-local">`, '' = agora);
     `tags: string[]`; `sourceId: string` ('' ou `'all'` = todas).
   - **(b) Segmentação (etapa 2):** abaixo do bloco de etapa do funil, adicionar:
     - **Origem:** `<Select>` alimentado por `useLeadSources()` com uma opção "Todas as origens"
       (valor sentinela `'all'`) + uma `SelectItem` por origem. `onValueChange` → `sourceId`.
     - **Tags:** `<LeadTagsInput value={tags} onChange={setTags} />` (chips).
   - **`audienceFilter` (useMemo):** incluir `tags` (só se `tags.length`) e `source_id` (só se
     `sourceId` !== '' e !== `'all'`). A dependência do `useMemo` passa a incluir `tags` e `sourceId`.
     A contagem ao vivo já reage (mesmo filtro em `countAudience`).
   - **(a) Agendamento (etapa 3):** adicionar `<Label>` + `<input type="datetime-local">` ("Quando enviar
     (opcional)"), com nota "Vazio = enviar agora.". Guardar em `scheduledAt`.
   - **`handleSend`:** calcular `scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null`.
     Passar `scheduled_at: scheduledIso` no `createCampaign`. Continuar chamando `dispatchCampaign`
     (expande a fila com os horários diferidos). (Contrato já suporta; ver Contratos.)
   - **Validação/label:** se `scheduledAt` preenchido e no passado → bloquear o envio com aviso
     ("Escolha uma data futura."). Botão da etapa 3: "Agendar" quando `scheduledAt` preenchido (futuro),
     senão "Enviar agora". `reset()` limpa os 3 campos novos.

2. **`src/components/cadencias/cadence-form.tsx`** (mod)
   - **(c)** Adicionar um bloco informativo (mesmo estilo das notas do form, ex. `rounded-md border
     bg-muted/40 p-3 text-sm text-muted-foreground`) com o texto:
     "A cadência para automaticamente se o contato responder ou pedir opt-out."
     Posição: logo após o campo "Nome" (topo do form), antes do bloco "Como inicia". Sem toggle, sem em-dash.

## Contratos não óbvios

Agendamento — o fluxo é "expandir agora, enviar depois" (não há cron de scheduled):
```ts
// handleSend
const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null
const campaign = await createCampaign.mutateAsync({
  ...,
  scheduled_at: scheduledIso,          // service grava status 'scheduled' quando != null
})
await dispatchCampaign.mutateAsync(campaign.id) // blast-dispatch expande a fila com scheduled_at diferido
```
`blast-dispatch` marca a campanha `scheduled` (futura) ou `queued` (imediata) e grava
`message_queue.scheduled_at` por item; o `process-message-queue` respeita a data. Nenhuma mudança de backend.

Audiência — manter o shape que o backend já consome:
```ts
const audienceFilter: AudienceFilter = useMemo(() => {
  const f: AudienceFilter = {}
  if (temperatures.size) f.temperature = [...temperatures]
  if (stageIds.length) f.stage_id = stageIds
  if (tags.length) f.tags = tags
  if (sourceId && sourceId !== 'all') f.source_id = sourceId
  return f
}, [temperatures, stageIds, tags, sourceId])
```
`source_id` é **único** (não array) — `<Select>` simples. Sentinela `'all'` = sem filtro de origem
(o `<Select>` do shadcn não aceita `value=""` em `SelectItem`).

Aviso da cadência — informativo e verídico: o engine (`process-cadences`) cancela o run em
`optOut` e `leadResponded` (obrigatórios). É só texto; nenhum estado/campo novo.

## Critérios de aceite

- [ ] Etapa 2 do wizard tem **Origem** (select de `lead_sources`, com "Todas as origens") e **Tags**
      (chips via `LeadTagsInput`); ambos opcionais.
- [ ] Selecionar origem e/ou digitar tags **atualiza a contagem de público ao vivo**.
- [ ] Etapa 3 tem campo **data/hora** opcional; vazio mantém "Enviar agora".
- [ ] Com data futura, o botão vira **"Agendar"**; a campanha é criada com `status 'scheduled'`
      e aparece como "Agendada" na lista.
- [ ] Data no passado bloqueia o envio com aviso de data futura.
- [ ] Sem data, o fluxo de envio imediato continua idêntico ao atual.
- [ ] `cadence-form` mostra o aviso "A cadência para automaticamente se o contato responder ou pedir
      opt-out." (sem toggle).
- [ ] Nenhuma string de UI usa em-dash (—).
- [ ] `tsc -b` e `npm run build` verdes; `npm run pvo -- specs/mkt-ativo-expor-ui/SPEC.md` passa 1-3.

### Plano de verificação no browser (Playwright, staging hfebv)
Reusa o host Veltz Demonstração (`44f69ec0`) com `mkt_ativo_enabled=true` + um template e algumas
tags/origens em leads (seed via Copiloto, igual ao Bloco 1). Confirmar no network que bate em `hfebv`.
- [ ] Wizard etapa 2: selecionar origem / digitar tag → contagem muda.
- [ ] Criar campanha **agendada** (data futura) → lista mostra "Agendada"; conferir por leitura
      `status='scheduled'` + `message_queue.scheduled_at` futuro.
- [ ] Criar campanha **imediata** (sem data) → segue "Na fila" como hoje.
- [ ] Abrir o form de cadência e ver o aviso de parada automática.
- [ ] Teardown do que for semeado, com resíduo zero.
