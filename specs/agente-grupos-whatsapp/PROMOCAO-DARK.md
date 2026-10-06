# Plano de Promoção DARK — agente de prospecção em grupos

> **Objetivo:** levar código + schema a **produção com TUDO DESLIGADO** (flag off, shadow on, dm_auto off, cron não agendado, sem sessão/número). **Nada processa dado pessoal** → o deploy dark **não aciona o DPA**. **Ligar (Fase 1)** exige, aí sim: DPA assinado + H4 (número/QR/HMAC) + calibração em sombra + OK do Toni.
>
> **Quem executa o quê:** o schema do **Central é do repo Hub** + **ritual de prod** (`npm run prod:dry` → Toni confirma a lista → `npm run prod:apply`), conduzido pelo copiloto do Hub. Merge e deploy a prod = **OK/ritual do Toni**. **Eu (Veltzy) preparo e coordeno; não executo prod.**

---

## Invariantes do estado DARK (conferir ao final)

- `companies.features.prospect_groups_enabled` — **ausente/false** (NÃO ligar). UI nasce oculta.
- `prospect_config` — sem linha em prod **ou**, se semear a Veltz: `is_enabled=false`, `shadow_mode=true`, `dm_auto_enabled=false`.
- `prospect_cron_config` — **VAZIO** em prod (`is_enabled=false`, url null) → crons no-op.
- **Nenhum `cron.schedule`** executado em prod (deferido).
- **Nenhuma sessão WAHA** dedicada; nenhum webhook aponta pras edges.
- Secrets `PROSPECT_WAHA_WEBHOOK_HMAC` e `TYPESAFE_API_KEY` — **não** precisam existir no dark (só na Fase 1).
- `system_flags.prospect_globally_enabled=true` é inócuo enquanto a flag da empresa está off.

Resultado: todas as edges ficam **inertes** (nada as chama) e o schema é **aditivo**. Risco de prod ≈ zero.

---

## Ordem de promoção

### A. Hub — schema do Central (repo Hub · ritual de prod · DARK)
Aplicar o conteúdo do **§H1 + §H6** da SPEC em prod via `prod:dry` → Toni confirma a lista → `prod:apply`:
1. Tabelas `veltzy.prospect_config/criteria/groups/group_messages_raw/signals/dm_log/contacted` (+ RLS + trigger `prospect_signals_guard` + RPC `prospect_review_signal` + funções).
2. `veltzy.prospect_cron_config` (**vazio**) + funções `prospect_run_process_windows`/`prospect_purge_raw`. **NÃO** rodar os `cron.schedule` em prod.
3. `public.system_flags` insert `prospect_globally_enabled` (aditivo).
4. Deploy da edge **`ai-decide`** no Central prod (+ `_shared/jev`, `anthropic-decision`). Inerte até ser chamada.
5. `gen types` do Central.
→ Tudo aditivo. Nenhum `ALTER` destrutivo. (A coluna `warmup_started_at`, a edge `waha-group-participants` e o join-group **não** entram no dark — são Fase 1.)

### B. Veltzy — edges no Central prod (go humano do Toni)
Deploy das edges `prospect-classify`, `prospect-group-inbound`, `prospect-dm-send`, `prospect-process-windows`, `prospect-dm-draft`, `prospect-approach` (+ `_shared` novos) no **Central prod**. Inertes (sem cron, sem webhook, flag off). `verify_jwt` conforme `config.toml`. Deploy no Central prod é privilegiado → **só com go do Toni**.

### C. Veltzy — frontend a produção (merge → main → Vercel)
1. **Merge do PR #219 → develop** (OK do Toni).
2. Promover os commits da feature **develop → main por cherry-pick isolado** (disciplina do débito de release Veltzy; **nunca** develop→main cego) — OK do Toni.
3. Vercel builda `main`. A UI nasce **oculta** (flag off) → invisível pra todos.

---

## O que NÃO entra no DARK (fica pra Fase 1 — exige DPA + OK)

Ligar a flag · provisionar sessão/número/QR/secret HMAC · agendar crons · edge `waha-group-participants` · coluna `warmup_started_at` · `TYPESAFE_API_KEY` · entrar nos grupos · `shadow_mode=false`/`dm_auto_enabled=true`.

---

## Verificação pós-DARK (prod)
- [ ] Flag off em prod → UI não aparece.
- [ ] 7 tabelas `veltzy.prospect_*` + funções/trigger presentes; RLS ativa.
- [ ] `prospect_cron_config` vazio; nenhum job agendado (`SELECT * FROM cron.job` sem entradas prospect).
- [ ] Edges `prospect-*` + `ai-decide` deployadas e inertes.
- [ ] Zero dado pessoal gravado (nenhuma sessão → nenhum inbound).

---

## Pré-requisitos do Toni para a Fase 1 (ligar depois)
DPA da TypeSafe assinado · número novo aquecido + QR pareado · smoke do V1 · (opcional) `TYPESAFE_API_KEY` · grupo de teste · depois: flag on + shadow + calibração + OK pra DM.
