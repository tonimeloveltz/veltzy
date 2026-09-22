# SPEC — mkt-ativo no Veltzy · Fase 1: Disparo em massa + HSM

> Frente: levar a pegada mkt-ativo (outbound) do Leadbaze pro Veltzy (inbound/passivo).
> Fase 1 = **disparo em massa (campanhas) + envio de template HSM**, habilitável **por-empresa**.
> Cadências/"wait" (drip) = **Fase 2** (estende o motor existente, não entra agora).
> Autoria: Copiloto (eep51abp). Execução: Codificadora Veltzy (x5gqtwno). Branch: `feat/automacoes-disparos`.

---

## 0. Princípios (leia antes de codar)

1. **Não duplicar o motor.** O Veltzy JÁ tem automação event-driven (`automation_rules`) + fila (`message_queue`) + cron (`process-message-queue`) + envio (`whatsapp-send`). **Nada disso é tocado.** A camada de campanha **expande em itens da `message_queue`** e deixa a infra que já roda enviar.
2. **Canal via abstração existente.** Envio SEMPRE pela camada multi-provider do Veltzy (`_shared/whatsapp-provider.ts` / `whatsapp-send` / `resolve-instance.ts`). **Nunca Z-API direto** (aquilo era do Leadbaze e não vem).
3. **Multi-tenant.** Tudo com `company_id NOT NULL` + RLS padrão do Veltzy (helpers `get_current_company_id()`, `is_company_admin()`, etc.). Edges usam service_role e validam company no código, nunca confiam no payload.
4. **Gate por-empresa server-side.** Flag `companies.features.mkt_ativo_enabled` (JSONB), checada com **early-return** no topo das edges ANTES de enfileirar/enviar. Precedente pronto pra copiar: `sdr-ai/index.ts:244-252` (gate do SDR). UI esconde a seção se a flag off (necessário, insuficiente).
5. **Reuso da fonte (Leadbaze).** Aproveitamos o **schema de campanha** (`blast_campaigns`/`blast_recipients`) e o **blueprint de UX** (criar campanha em etapas). O loop+sleep do `execute-blast` NÃO é copiado — a fila do Veltzy cuida do ritmo.

---

## 1. Modelo de dados (migrations em STAGING primeiro; Central = só Toni)

### 1a. `whatsapp_templates` (HSM) — NOVA
Hoje só existem o TYPE (`src/types/whatsapp-template.ts`), a UI admin e o proxy (`cloud-api-templates-proxy`); a tabela **não existe** (confirmado no staging). Criar alinhando **exatamente** ao type existente.

- `id uuid pk`, `company_id uuid not null → companies`, `name text`, `language text` (ex. `pt_BR`)
- `category text check (UTILITY|MARKETING|AUTHENTICATION)`
- `components jsonb` (header/body/footer/buttons — mesma forma do type)
- `body_text text` (o corpo com variáveis posicionais `{{1}}`, `{{2}}` — padrão Meta)
- `waba_id text`, `meta_template_id text`
- `status text check (LOCAL|PENDING|APPROVED|REJECTED|PAUSED)` — alinhar aos valores do type
- `created_at/updated_at`
- RLS: tenant isolation por `company_id` (padrão Veltzy). ⚠️ **Não confundir com `reply_templates`** (resposta rápida do inbox, não é HSM).
- Integra com o `cloud-api-templates-proxy` existente (sincroniza status do Hub→Meta).

### 1b. `blast_campaigns` — NOVA (adaptada do Leadbaze)
- `id uuid pk`, `company_id uuid not null → companies`
- `name text`
- `template_id uuid → whatsapp_templates` — **no Veltzy o disparo é sempre via template** (não texto livre como no Leadbaze)
- `variable_mapping jsonb` — posição do template → campo do lead ou valor fixo (ex. `{"1":"lead.name","2":"Black Friday"}`)
- `audience_filter jsonb` — como seleciona os leads (status, tags, temperature, pipeline/stage, source)
- `throttle_config jsonb` — override dos limites anti-ban (delay_min/delay_max, daily_cap, window_start/window_end); ausente = **defaults de sistema** (ver §4bis)
- `status text check (draft|scheduled|queued|running|completed|failed|paused|cancelled)`
- `scheduled_at, started_at, completed_at timestamptz`
- `total_recipients, queued_count, sent_count, failed_count int default 0`
- `created_by`, `created_at`
- Sem `heartbeat` (era artefato do loop do Leadbaze; aqui o progresso vem da fila)
- RLS: tenant isolation por `company_id`

### 1c. `blast_recipients` — NOVA (adaptada do Leadbaze)
- `id uuid pk`, `campaign_id uuid not null → blast_campaigns on delete cascade`
- `lead_id uuid → veltzy.leads`, `phone text` (snapshot no momento do disparo)
- `status text check (pending|queued|sent|failed|skipped)`
- `message_queue_id uuid → message_queue` — **liga o recipient ao item enfileirado** (fonte do status)
- `error_message text`, `sent_at timestamptz`
- `unique (campaign_id, lead_id)`
- RLS: via `campaign_id → company_id`

### 1d. Flag de feature — ALTER
- Adicionar `mkt_ativo_enabled` (bool, default false) ao objeto `companies.features` (mig 001). Empresas existentes sem a chave = tratadas como `false` no gate.

---

## 2. Camada campanha → fila (a lógica nova)

### 2a. Edge `blast-dispatch` (nome a confirmar) — NOVA
Fluxo:
1. Recebe `{ campaign_id }`. `verify_jwt=false` + auth manual (padrão das proxies do Veltzy).
2. **GATE**: lê `companies.features.mkt_ativo_enabled` da company da campanha; se off → early-return `{ skipped, reason:'mkt_ativo_not_enabled' }`, **sem enfileirar nada** (precedente `sdr-ai`).
3. Valida campanha (status `draft|scheduled`) e o template: **só permite `status = APPROVED`** para Cloud API (compliance). Template não aprovado → recusa (no Cloud API).
4. Resolve **audiência**: query em `veltzy.leads` pelo `audience_filter`, sempre dentro da `company_id`. Remove quem está em opt-out/block (ver §4bis).
5. Cria `blast_recipients` (um por lead).
6. Para cada recipient: resolve o template (mapeia `variable_mapping` → dados do lead) e **enfileira um item na `message_queue`** (`source='campaign'`, `scheduled_at` escalonado **respeitando os limites anti-ban do §4bis quando o provider for não-oficial**), gravando `message_queue_id` no recipient.
7. Marca campanha `queued`/`running`. **Não** faz loop+sleep+envio — quem envia é o `process-message-queue` que já roda.

### 2b. Ritmo e agendamento
- **Escalonar `scheduled_at`** dos itens. Para provider oficial (Cloud API): espaçamento leve. Para não-oficial: aplicar throttle do §4bis (delay maior + jitter, teto diário, janela).
- Campanha **agendada** (`scheduled_at` futuro): expande na criação com `scheduled_at` futuro nos itens da fila → **reusa o cron da fila, sem cron novo de campanha.**

---

## 3. Envio de template HSM (tornar o stub funcional)

- Hoje `send_template` é placeholder. Implementar na camada de envio (`whatsapp-send` + `_shared/providers/cloud-api.ts`).
- **Cloud API**: monta o payload de template do WhatsApp (name, language, `components` com parâmetros posicionais resolvidos).
- **Evolution/WAHA (não-oficiais)**: não há template aprovado — envia o **body renderizado como texto** (mesma fonte de conteúdo), sujeito ao §4bis.
- **Resolver de variáveis**: adaptar o do Leadbaze para **posicional** (`{{1}}`→valor), alimentado pelo `variable_mapping` da campanha + dados do lead no momento do envio.

---

## 4. Gate por-empresa (server-side, à prova de bypass)

- **Autoritativo**: dentro da edge `blast-dispatch` (e qualquer edge que dispare campanha) — early-return por `features.mkt_ativo_enabled` ANTES de enfileirar. No Veltzy a automação é disparada por **código** (não trigger SQL), então a superfície de bypass é a própria chamada às edges — coberta pelo gate. INSERT direto em lead não dispara nada.
- **UI**: esconde a seção de Campanhas/mkt-ativo se a flag off (lê `company.features`).
- `mkt_ativo_enabled` governa **bulk**; a `automation_rules` existente segue com sua semântica própria — **não sobrepor**.

---

## 4bis. Mitigação de ban — providers não-oficiais (Evolution/WAHA)  ⭐ requisito do Toni

Escolhemos a Opção A (permitir os 3 providers). Como disparo em massa por canal não-oficial tem **risco real de banimento do número**, a proteção é obrigatória e **enforçada no servidor** — não é só aviso de tela. Aplicada quando o provider resolvido é **não-oficial** (Cloud API oficial dispensa, mas respeita a janela de horário se configurada).

### Enforcement server-side (na edge de dispatch / enfileiramento)
- **Throttle com jitter**: espaçamento bem maior que o transacional — default **30–90s randomizado** (não fixo), configurável. Aplicado no `scheduled_at` escalonado.
- **Teto diário por instância/número**: **50 msgs/dia por instância** (decisão do Toni — bem conservador, prioriza não-ban). Ao atingir, o restante reprograma pro dia seguinte. Conta envios do dia por instância. Escala com nº de instâncias da company; sobe na Fase 2 com warm-up.
- **Janela de horário**: só agenda envio em horário comercial configurável (ex. 08–20 no fuso da company); fora disso, reprograma.
- **Circuit breaker**: se a taxa de falha da campanha ultrapassar um limiar (ex. >30% num lote), **pausa a campanha** (`status=paused`) e sinaliza — sinal de instância limitada.
- **Respeitar opt-out/block**: não enviar para lead que pediu saída / está bloqueado. ⚠️ **Codificadora: confirmar o que o Veltzy já tem** (status de lead / unsubscribe / block); se não houver, definimos o mínimo.

### Config (onde ficam os limites)
- **Defaults de sistema seguros no código** — enforçados sempre pra não-oficial, mesmo sem o usuário configurar. É a proteção mínima que não dá pra desligar abaixo de um piso.
- **Override por-campanha**: `blast_campaigns.throttle_config` (delay_min/max, daily_cap, janela). Ausente = defaults.
- **(Fase 2)**: config por-company + **warm-up** automático de número novo (rampa de volume) + **spintax**/variação de conteúdo + priorização por engajamento.

### UI (avisos + boas práticas)
- Ao criar campanha cujo público cai em canal não-oficial: **banner de risco** claro (WhatsApp pode banir o número) + **checklist de boas práticas** (público que já interagiu/opt-in, começar com volume baixo/warm-up, evitar links suspeitos, respeitar opt-out).
- Mostrar os limites que serão aplicados (delay, teto diário, janela) **antes** de confirmar o disparo.

---

## 5. Frontend (Fase 1 mínimo, na cara do Veltzy)
- **Campanhas (lista)** + **criar campanha** em etapas (blueprint do Leadbaze): escolher template HSM → definir audiência (filtro) → **[se não-oficial] banner de risco + limites aplicados (§4bis)** → revisar (contagem de destinatários) → enviar/agendar.
- **Acompanhamento**: status da campanha + contagem sent/failed (lida dos recipients/fila); estado `paused` do circuit breaker visível.
- Gate: só aparece com `mkt_ativo_enabled`. Sem CSV import nesta fase.

---

## 6. Decisões (batidas)
- **A. Compliance por provider no bulk** ✅ **DECIDIDO (Toni): Opção A** — os 3 providers permitidos. Template é a fonte do conteúdo; Cloud API = HSM aprovado; Evolution/WAHA = body renderizado como texto. **Condição:** canal não-oficial exige mitigação de ban (§4bis).
- **B. Ritmo** ✅ expandir na criação + `scheduled_at` escalonado na fila, sem cron novo.

---

## 7. Fora de escopo (Fase 2+)
Cadências multi-step / `wait` / drip (estende `automation_rules`) · warm-up automático de número · spintax/variação de conteúdo · config de limites por-company · CSV import · métricas avançadas · `send_email` · `generate_ai` nas automações (feature nova via gateway do Hub).

---

## 8. TDD / critérios de aceite
- Gate nega quando `mkt_ativo_enabled` off (não enfileira).
- `audience_filter` seleciona os leads certos, isolado por company (RLS); exclui opt-out/block.
- Campanha expande N recipients e enfileira N itens na `message_queue`.
- Envio HSM monta payload Cloud API correto; template não-`APPROVED` é recusado (Cloud API).
- **Anti-ban (não-oficial)**: throttle+jitter aplicado no `scheduled_at`; teto diário reprograma excedente; fora da janela reprograma; circuit breaker pausa a campanha ao estourar o limiar.
- Status do recipient reflete o item da fila.
- **Prova E2E em STAGING** (skill sdd/verify): criar template → (aprovar/mock) → criar campanha → disparar → itens processados pela fila → status atualizado na tela.

## 9. Entrega
- Migrations em **STAGING** primeiro (nunca Central; Central/prod = só Toni).
- `feat/automacoes-disparos` → PR → develop (fluxo do Veltzy). **Build local verde** antes de commit (`tsc -b && vite build`).
- Edge deploy em staging via conta Veltz (go operacional do Copiloto; prod só Toni).
- Ao fechar cada peça: `send_message` ao Copiloto com hash+estado+pendências.
