# SPEC — mkt-ativo IA: "gerar mensagem com IA" nas cadências

> Frente IA da pegada mkt-ativo. ESCOPO FASE INICIAL: ação `generate_ai` SÓ em **cadências** (1 lead por vez ao longo do tempo = custo diluído). Blast em massa × IA por-lead = pico de custo → **Fase 2**.
> Cross-repo: Perna Veltzy = x5gqtwno (branch `feat/mkt-ativo-ia`, base e1b986e). Perna Hub = ynrs80x9. Copiloto: eep51abp.
> SEMPRE via gateway do Hub (ai-complete) — chave de IA NUNCA sai do Hub. Landa dark. Envio/custo real = bateria do Toni.

---

## Governança de custo — TRIPLA (o coração desta frente)

1. **Gate Veltzy (opt-in por empresa):** `companies.features.ai_msg_enabled` (flag NOVA, adicional ao mkt_ativo_enabled), checado **server-side no executeStep ANTES de chamar o Hub**. Off → marca o passo 'ai_not_enabled', **não chama IA, custo ZERO**.
2. **Gate/teto Hub:** `check_ai_access` (roda antes do provider) — is_ai_enabled + **teto $/mês por empresa** (default $10, GLOBAL entre todas as features/produtos da empresa; o mkt-ativo compartilha o orçamento de IA da empresa). Retorna LIMIT_EXCEEDED/TENANT_DISABLED/etc.
3. **Modelo barato:** `gpt-4.1-nano` (0.10/0.40 por Mtok, piso suportado) — **cravado pela perna Hub no `ai_features`**, NÃO no código.

---

## Contrato da chamada (Veltzy → Hub)

`HubClient.complete({ company_id, product:'veltzy', feature:'cadence_ai_message', lead_id, messages, max_tokens:~150, temperature:~0.7 })`
- ⚠️ **`feature` = `cadence_ai_message` (snake_case) — TEM que casar 1:1** no body do HubClient E na linha do `ai_features` (gotcha kebab≠snake já mordeu no Hub).
- `product='veltzy'` (CHECK aceita veltzy|leadbaze|powerv).
- `messages` = formato OpenAI: system (instrução: gerar msg de WhatsApp curta, tom X) + user (contexto do lead {nome, empresa, stage, source...} + prompt do step).
- Resposta: `{ ok, data:{ content, usage:{cost_usd}, model } }`. `content` → texto da msg enfileirada.

---

## Perna VELTZY (x5gqtwno)

1. **Migration**: `cadence_steps.action_type += 'generate_ai'` (CHECK); `config` = `{prompt, temperature?, max_tokens?}`.
2. **process-cadences executeStep** — novo case `generate_ai`:
   a. **GATE** `ai_msg_enabled` (server-side). Off → passo 'ai_not_enabled', NÃO chama Hub, custo zero.
   b. Monta `messages` (system + contexto do lead + prompt do step).
   c. `HubClient.complete(feature:'cadence_ai_message', lead_id, ...)`.
   d. **Trata erro gracioso** (padrão sdr-engine agent-loop.ts:112): LIMIT_EXCEEDED / TENANT_DISABLED / COMPANY_DISABLED / GLOBALLY_DISABLED → **para o passo, marca failed com o motivo, SEM retry**. IA falhou → **NÃO envia msg** (nada de msg vazia/errada).
   e. Sucesso → `content` vira `send_message` enfileirado na message_queue (source='cadence').
3. **Frontend** (cadence-form): step `generate_ai` = campo de prompt/instrução + aviso "usa IA (custo)"; só aparece se `ai_msg_enabled`.

## Perna HUB (ynrs80x9)

- **Cadastrar a feature** no `ai_features`: `product='veltzy'`, `feature_key='cadence_ai_message'`, `default_provider='openai'`, `default_model='gpt-4.1-nano'`, `is_active=true`. É **CONFIG (INSERT na tabela), NÃO mudança de código** no gateway (o ai-complete já suporta tudo).
- ⚠️ `ai_features` vive no **Central compartilhado** → **aplicar o INSERT = go DIRETO do Toni**. Prepara o SQL pronto; até aplicar, o dev/teste cai no **fallback gpt-4o-mini** (funciona, custa um tico mais — ok pra teste de volume mínimo).
- Nenhuma alteração no código do gateway.

---

## Rastreio de custo / limitação conhecida
- `ai_usage` loga por `lead_id` (metadata FIXO do Hub). Rastreio por cadência/step (campaign_id/step_id no log) = **Fase 2** (exigiria estender o gateway = pedido de mudança no Hub). Aceito `lead_id` por ora.
- Soft-warning 80% do teto (email+slack) já existe no Hub.

## Decisões do Toni — antes de LIGAR (não bloqueiam construir dark)
1. **Pricing:** IA = add-on pago ou incluso?
2. **Teto por empresa:** ajustar `tenant_ai_config.monthly_limit_usd` (default $10/mês) — quanto de IA/mês.
3. **Aplicar o cadastro da feature** no `ai_features` do Central (write no Central = go dele) + ligar `ai_msg_enabled` + `is_ai_enabled` na empresa.

## Testes / validação
- TDD + build verde. E2E de fila: cadência com step generate_ai → **gate OFF não chama IA (custo zero)** → gate ON gera (volume MÍNIMO, 1-2 chamadas reais ou mock) → content enfileirado; teto estourado → para gracioso.
- Envio real + custo real por empresa = **bateria do Toni**.
- Landa **dark** (ai_msg_enabled=false default; sem empresa ligada, zero custo).
