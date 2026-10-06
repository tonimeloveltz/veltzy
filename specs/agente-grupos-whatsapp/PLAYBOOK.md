# Playbook — Agente de prospecção em grupos de WhatsApp (Veltzy)

Guia operacional da feature. Para o contrato técnico, ver `SPEC.md`; para produto/LGPD, `PRD.md`.

---

## 1. O que é

Um agente que entra em grupos de WhatsApp por um **número dedicado**, **só escuta** (nunca escreve no grupo), identifica pedidos de indicação ("alguém indica uma consultoria de X?") e, com alta confiança, manda **uma** DM ao autor identificando a Veltz. A resposta cai no **inbox** do Veltzy e um humano assume. Cria contato + deal numa pipeline de prospecção dedicada.

**Fluxo ponta a ponta:**
```
grupo (escuta) → pré-filtro determinístico → classificação (Jev, fallback Haiku)
   → faixa por probabilidade:
        auto_dm  → DM automática (só com tudo ligado) → contato+deal → resposta no inbox → humano
        review   → fila de revisão humana (admin aprova/rejeita)
        alert    → sem telefone DM-able: tarefa pro time abordar manualmente
        discard  → descarta
```

---

## 2. Arquitetura (resumo)

- **Sessão WAHA dedicada** (número novo), webhook aponta para uma edge nova do Veltzy — **não** passa pelas edges de produção (`waha-inbound`/`waha-webhook-receiver`/`whatsapp-send`/`process-message-queue` intocadas).
- **Edges Veltzy:** `prospect-group-inbound` (recebe, HMAC, grupo→fila / 1:1→inbox), `prospect-classify` (chama o Hub), `prospect-dm-send` (envia via Hub), `prospect-process-windows` (cron de janelas), `prospect-dm-draft` + `prospect-approach` (UI).
- **Hub:** `ai-decide` (classificador com fallback Haiku), `waha-send-message` (envio), schema `veltzy.prospect_*` + crons.
- **IA:** classificação por **Jev** (TypeSafe, decisão tipada) com **fallback Haiku** automático; texto da DM por **Haiku** (`ai-complete`). Custo/quota pelo Hub (`ai_usage`, teto mensal).

---

## 3. Flags e estados (os "botões")

| Controle | Onde | Efeito |
|---|---|---|
| `companies.features.prospect_groups_enabled` | Central (por empresa) | Liga/desliga a feature e a UI. Oculta (fora do painel do Hub). v1 só na Veltz. |
| `prospect_config.is_enabled` | por empresa | **Kill switch da empresa**. |
| `prospect_config.shadow_mode` | por empresa | `true` = classifica e registra, **não envia nada**. |
| `prospect_config.dm_auto_enabled` | por empresa | Libera a **DM automática** (o manual pela fila ignora esse). |
| `system_flags.prospect_globally_enabled` | global | **Kill switch global** (todas as empresas). |

**Para operar em sombra:** flag ON + `is_enabled=true` + `shadow_mode=true` + `dm_auto_enabled=false`.
**Para ligar DM automática:** `shadow_mode=false` + `dm_auto_enabled=true` (+ critérios do §6).

---

## 4. Guardrails de envio (sempre ativos no `prospect-dm-send`)

- `shadow_mode=true` **bloqueia todo envio**; `dm_auto_enabled=false` bloqueia só o automático (manual pela fila ainda envia).
- **Rampa de aquecimento:** 3 DMs/dia na 1ª semana → teto 15/dia.
- **Horário comercial** (America/Sao_Paulo) + **intervalo aleatório** entre envios.
- **Um contato por pessoa, para sempre** (reserva atômica por telefone) — sem follow-up automático.
- **Opt-out obrigatório:** toda DM precisa conter "SAIR/PARE" (travado no gate de envio) e a lista de opt-out é checada antes.
- **Kill switches** empresa + global.

---

## 5. LGPD (resumo operacional)

- **Base legal:** legítimo interesse (pedido público de indicação em grupo).
- **Minimização:** a IA de classificação recebe **só o texto** (sem telefone/nome). Lista de participantes **nunca** é importada.
- **Retenção:** mensagens brutas do grupo expurgadas em **7 dias** (cron); só o trecho que gerou o sinal fica. Sinais sem lead têm `author_*` anonimizados após 7 dias.
- **Opt-out:** "SAIR/PARE" → `marketing_opt_out` + bloqueio permanente.
- **Transferência internacional:** TypeSafe (Jev) e Anthropic (Haiku), ambos EUA → exige **DPA da TypeSafe assinado** antes de processar dados reais em produção.

---

## 6. Rollout faseado (a ordem importa)

**Fase 0 — Deploy dark.** Código + schema em produção com a flag **OFF**. Nada roda. (Ver §11 — pré-requisitos e ritual.)

**Fase 1 — Sombra com grupos reais (DM OFF).** Flag ON na Veltz, `shadow_mode=true`. O agente escuta, classifica e registra — **não envia**. Requer: DPA assinado, número pareado, sessão(ões) ativas.

**Fase 2 — Calibração.** Rotular na aba Sombra até **≥ 50 positivos revisados ou 4 semanas** + **200 negativos** para recall. Medir **precisão no `threshold_auto`** e **taxa de resolução de telefone por engine**.

**Fase 3 — Ligar DM automática.** Só quando: **precisão ≥ 0,90** no `threshold_auto`, **resolução ≥ 70%** e **OK explícito do Toni**. Então `shadow_mode=false` + `dm_auto_enabled=true`, com a rampa 3→15.
- Se resolução **< 70%:** opera em **modo alerta** (sinais viram tarefa pra abordagem manual), sem DM automática.

---

## 7. Runbook operacional

**Entrar num grupo:** registrar o grupo na aba Grupos (invite link) **+** a sessão WAHA entra no grupo (ação WAHA/Hub). O agente passa a escutar.

**Operar em sombra:** acompanhar a aba Sombra (rotular é/não-é oportunidade) e Métricas (lidas, sinais por faixa, resolução por engine). Ajustar `threshold_auto`/`threshold_review` e o `questions` do critério por nicho conforme a calibração.

**Fila de revisão (faixa `review`):** admin vê snippet + categoria + urgência → **Aprovar** (gera rascunho de DM editável → envia) ou **Rejeitar**.

**Aba Alerta (faixa `alert`):** oportunidade sem telefone → botão **"Abordei"** cria contato+deal (admin informa o telefone), sem DM.

**Desligar rápido:** `prospect_config.is_enabled=false` (empresa) ou `system_flags.prospect_globally_enabled=false` (tudo).

---

## 8. Monitoramento

- **Métricas (UI):** mensagens lidas, sinais por faixa, DMs enviadas, respostas, taxa de resposta, resolução por engine (WEBJS×NOWEB).
- **Custo IA:** `ai_usage` no Hub (provider/model/custo por chamada); teto mensal em `tenant_ai_config`. Estimativa: ~US$ 0,03–0,05/mês por grupo ativo (dominado pela classificação; DM é rara).
- **Entregas de DM:** `prospect_dm_log` (queued/sent/failed/blocked + motivo).

---

## 9. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Webhook 401 | HMAC inválido / secret ausente | Conferir `PROSPECT_WAHA_WEBHOOK_HMAC` e a config de HMAC da sessão. |
| Nada é classificado | cron não agendado / sem critério ativo / grupo não registrado | Agendar `prospect-process-windows` (deferido); conferir `prospect_criteria` e `prospect_groups`. |
| Oportunidades sempre em "alerta" | telefone não resolvido (@lid) | Confirmar edge `waha-group-participants` (Hub) e a engine com melhor resolução. |
| DM não sai | `shadow_mode`/`dm_auto_enabled`/kill switch/guardrail | Checar `prospect_config` e o motivo em `prospect_dm_log`. |
| Classificador sempre Haiku | sem `TYPESAFE_API_KEY` / sem linha `prospect_classify` provider=jev | Gravar o secret + semear a config (Hub). |

---

## 10. Checklist de produção (antes de LIGAR)

- [ ] **DPA da TypeSafe assinado** (bloqueador LGPD — grupos reais).
- [ ] Schema `veltzy.prospect_*` + crons aplicados no Central **pelo Hub**, via ritual de prod.
- [ ] Edges Veltzy (`prospect-*`) deployadas no Central.
- [ ] Frontend em produção (merge → main → Vercel).
- [ ] **Número novo aquecido** alguns dias + **QR pareado** pelo Toni.
- [ ] Sessões `-webjs`/`-noweb` provisionadas (webhook evento `message` + HMAC).
- [ ] Edge `waha-group-participants` + coluna `warmup_started_at` (Hub) para rampa/resolução reais.
- [ ] `TYPESAFE_API_KEY` gravado (opcional; sem ele = fallback Haiku).
- [ ] Flag ON só na Veltz · `shadow_mode=true` · `dm_auto_enabled=false`.
- [ ] Calibração (Fase 2) atingida + **OK do Toni** para ligar a DM.

---

## 11. Débitos / deferidos

- Fallback de resolução de telefone por API (edge `waha-group-participants` no Hub).
- Rampa semanal real (coluna `warmup_started_at`); hoje proxy por teto diário.
- Agendamento dos crons em produção (deferido; guard de URL vazia cobre o no-op).
- `messages_read` é contador best-effort.
