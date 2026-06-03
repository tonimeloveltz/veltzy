# Investigacao: Webhook Inbound por Pipeline (Veltzy)

**Data:** 2026-06-02
**Escopo:** Verificar estado real do fluxo de webhook inbound (recebimento de leads via POST externo), incluindo Edge Function, tabelas, frontend e webhooks de saida.
**Fonte de verdade:** Codigo e schema (nao docs).

---

## 1. O que ja funciona (fluxo atual com codigo real)

### 1.1 Edge Function `source-webhook`

**Arquivo:** `supabase/functions/source-webhook/index.ts` (78 linhas)
**Config:** `verify_jwt = false` (config.toml)

**Endpoint:**
```
POST {SUPABASE_URL}/functions/v1/source-webhook?company={slug}&source={source_slug}
```

**Payload aceito (JSON body):**
```json
{
  "phone": "11999999999",          // OBRIGATORIO
  "name": "Joao Silva",            // opcional
  "email": "joao@example.com",     // opcional
  "tags": ["landing-page"],        // opcional (array)
  "observations": "Veio da promo"  // opcional
}
```

**Fluxo interno:**

1. Extrai `company` (slug) e `source` (slug, default `manual`) dos query params
2. Cria **dois clients Supabase com service_role**:
   - `supabase` com `{ db: { schema: 'veltzy' } }` -- dominio
   - `supabasePublic` com `{ db: { schema: 'public' } }` -- auth/profiles
3. Busca `companies.id` por slug (public) -- retorna 404 se nao achar
4. Valida que `phone` existe no body -- retorna 400 se faltar
5. Busca `lead_sources.id` por slug na empresa (veltzy) -- pode ser null
6. Busca pipeline default (`is_default=true`), fallback para primeiro ativo por position
7. Busca primeiro stage do pipeline por position
8. Normaliza telefone com `normalizePhoneBR()` (adiciona 55 se necessario)
9. Busca lead existente por `company_id + phone` (veltzy)
   - **Se existe:** atualiza name/email/tags/observations e retorna `{ updated: true }`
   - **Se nao existe:** atribui vendedor aleatorio (random entre `is_available=true` em profiles) e insere lead
10. Retorna `{ success: true, leadId }`

**Schema routing: CORRETO.** Lead e inserido via client `veltzy`, company via client `public`.

### 1.2 O que source-webhook NAO faz (por design)

| Funcionalidade | Status | Motivo |
|---|---|---|
| Criar mensagem em `messages` | Nao faz | Webhook de formulario, nao de chat |
| Disparar SDR-AI / SDR-Engine | Nao faz | Sem mensagem, sem contexto pra IA |
| Disparar `run-automations` | **Nao faz** | Deveria disparar `lead_created` mas nao dispara |
| Criar deal em `deals` | Nao faz | Logica de deal so existe em `lead-inbound-handler` |
| Preencher `whatsapp_instance_name` | Nao faz | Correto: lead de formulario nao tem instancia |
| Usar `_shared/lead-inbound-handler.ts` | Nao usa | Logica propria, mais simples |
| Usar `_shared/resolve-instance.ts` | Nao usa | Correto: sem messaging |

### 1.3 Comparacao: source-webhook vs lead-inbound-handler

| Aspecto | source-webhook | lead-inbound-handler |
|---|---|---|
| Usado por | Formularios / landing pages | WhatsApp (zapi/evolution), Instagram |
| Criacao de lead | Logica propria | Shared `createLead()` |
| Mensagem | Nao cria | Cria em `messages` |
| SDR dispatch | Nao | Sim (v1 sdr-ai / v2 sdr-engine) |
| Automacoes | **Nao** (GAP) | Sim (`run-automations`) |
| Deal | Nao cria | Cria via `createDealForLead()` |
| Atribuicao | Random simples | Random com filtro por instancia + fallback admin |
| Avatar | Nao | Busca foto do WhatsApp |
| Auto-reply fora do horario | Nao | Sim |
| Schema routing | Correto | Correto |
| Logging | Catch-all generico | Estruturado com `[lead-inbound]` tags |

### 1.4 Tabelas envolvidas

| Tabela | Schema | Papel no fluxo |
|---|---|---|
| `companies` | public | Lookup por slug |
| `profiles` | public | Busca vendedores disponiveis |
| `leads` | veltzy | Busca/cria/atualiza lead |
| `lead_sources` | veltzy | Lookup por slug para `source_id` |
| `pipelines` | veltzy | Pipeline default |
| `pipeline_stages` | veltzy | Primeiro stage do pipeline |
| `source_integrations` | veltzy | **NAO USADA** pelo source-webhook (existe mas e ignorada) |
| `pipeline_sources` | veltzy | **NAO USADA** (mapeamento N:N source->pipeline_stage, morta) |

**Nota sobre duplicacao de tabelas:** As tabelas `lead_sources`, `source_integrations`, `pipeline_sources`, `activity_logs`, `automation_logs` e `system_settings` existem tanto em `public` quanto em `veltzy` (criadas em 001-009, depois duplicadas em 010_central_migration). O codigo do frontend e Edge Functions usam **apenas as versoes `veltzy`**. As versoes `public` sao vestigios da migracao.

### 1.5 Frontend: Configuracao de webhook

**Arquivo:** `src/components/admin/integrations-tab.tsx`

A tab "Webhooks" no painel admin mostra a URL pronta:
```
{SUPABASE_URL}/functions/v1/source-webhook?company={slug}&source=manual
```

E isso. Nao ha:
- Geracao de URL unica por origem/pipeline
- Escolha de pipeline destino
- Mapeamento de campos do payload externo
- Copiar URL com botao
- Documentacao inline do formato esperado

**Lead Sources Manager** (`src/components/admin/lead-sources-manager.tsx`): Permite criar/editar/deletar origens (name, slug, color, icon). Funcional mas desconectado do webhook -- admin cria a origem mas nao gera URL com o slug correspondente.

**Source Integrations Service** (`src/services/source-integrations.service.ts`): CRUD completo usando `veltzy()`. Usa `source_integrations.config` (JSONB) mas nenhuma UI consome esse service para webhooks.

### 1.6 Webhooks de saida (outbound)

**Estado: TIPO DEFINIDO, NAO IMPLEMENTADO.**

- `AutomationAction` type inclui `'send_webhook'`
- `automation_rules.action_type` CHECK constraint permite `'send_webhook'`
- `automation-rule-modal.tsx` tem label `'Enviar webhook'` mas **NAO inclui na lista de acoes selecionaveis**
- `run-automations/index.ts` switch/case **NAO tem case `send_webhook`**
- Nao existe retry, fila, assinatura HMAC, payload schema, ou log de envio

---

## 2. Gaps criticos (bloqueantes)

### GAP-C1: source-webhook NAO dispara automacoes

**Severidade:** CRITICA
**Impacto:** Lead entra via webhook de formulario mas `run-automations` nunca e chamado. Regras de automacao configuradas para `lead_created` (ex: notificar equipe, adicionar tag, enviar WhatsApp de boas-vindas) simplesmente nao executam para leads de formulario. Apenas leads de WhatsApp/Instagram disparam automacoes.

**Evidencia:** `source-webhook/index.ts` nao tem nenhum `fetch` para `run-automations`. Comparar com `lead-inbound-handler.ts` linhas 170-188 que faz:
```typescript
fetch(`${params.supabaseUrl}/functions/v1/run-automations`, {
  method: 'POST',
  body: JSON.stringify({ trigger: 'lead_created', leadId: lead.id, ... }),
})
```

### GAP-C2: source-webhook NAO cria deal

**Severidade:** CRITICA
**Impacto:** Leads de formulario entram sem deal associado. Se a empresa usa o modulo de deals/negocios, esses leads ficam orfaos no pipeline sem deal. `lead-inbound-handler` cria deal automaticamente via `createDealForLead()`.

### GAP-C3: Nao existe pipeline routing por origem

**Severidade:** CRITICA para o caso de uso "webhook por pipeline"
**Impacto:** TODOS os leads de webhook caem no pipeline default, independente do `source` passado na URL. A tabela `pipeline_sources` existe (mapeamento N:N source->pipeline_stage) mas e completamente ignorada pelo source-webhook. Nao ha como mandar leads de "Google Ads" para pipeline X e "Meta Ads" para pipeline Y.

### GAP-C4: Sem autenticacao no webhook

**Severidade:** CRITICA em producao
**Impacto:** Qualquer pessoa que descubra o slug da empresa pode criar leads ilimitados. Nao ha:
- Token/secret por integracao
- HMAC signature verification
- Rate limiting por empresa
- IP allowlist

O `verify_jwt=false` e correto (webhook externo nao tem JWT), mas nenhum mecanismo substituto existe.

---

## 3. Gaps secundarios

### GAP-S1: Atribuicao de vendedor e random simples

**Impacto:** source-webhook faz `sellers[Math.floor(Math.random() * sellers.length)]`. Nao usa round-robin real, nao respeita carga do vendedor, nao filtra por instancia WhatsApp. `lead-inbound-handler` tem logica muito mais sofisticada (filtro por instancia, fallback para admin).

### GAP-S2: Error handling fragil no pipeline lookup

**Impacto:** Se a empresa nao tem pipeline ativo, a busca do fallback usa `.single()` (linha 36-37) que lanca erro. Lead nao e criado e o webhook retorna 500 generico. Deveria retornar 400 com mensagem clara.

### GAP-S3: Sem logging estruturado

**Impacto:** Catch-all generico sem `console.error()`. Impossivel debugar em producao. `lead-inbound-handler` tem logging estruturado com tags `[lead-inbound]`.

### GAP-S4: Sem activity_log para leads de webhook

**Impacto:** `lead-inbound-handler` (via automacoes) loga atividades. source-webhook nao grava nada em `activity_logs`. Lead aparece no pipeline sem rastro de como entrou.

### GAP-S5: Frontend nao gera URL customizada

**Impacto:** Admin ve URL fixa com `source=manual`. Nao ha:
- Botao copiar
- Geracao de URL por origem (ex: `source=google-ads`)
- Preview do payload esperado
- Teste de webhook inline

### GAP-S6: Tabela source_integrations nao e usada

**Impacto:** Existe tabela com `config JSONB` e `integration_type = 'webhook'` pronta, mas source-webhook ignora completamente. O config poderia guardar: token de autenticacao, pipeline destino, mapeamento de campos, URL de callback.

### GAP-S7: Tabela pipeline_sources e morta

**Impacto:** Mapeamento N:N entre source e pipeline_stage existe no schema mas nada lhe da no frontend nem no backend. Provavelmente vestigio de spec nunca implementado.

### GAP-S8: Webhooks de saida nao implementados

**Impacto:** Tipo `send_webhook` definido em AutomationAction mas sem backend, sem UI selecionavel, sem execucao. Admin nao consegue configurar "quando lead muda de stage, enviar POST para meu sistema".

### GAP-S9: CORS aberto (`Access-Control-Allow-Origin: *`)

**Impacto:** Qualquer site pode chamar o webhook via JS. Aceitavel para webhooks server-to-server mas arriscado sem rate limiting.

### GAP-S10: Sem tabela de webhook_logs

**Impacto:** Nao existe tabela dedicada para logar webhooks recebidos (payload, IP, resultado). `activity_logs` e `automation_logs` existem mas source-webhook nao grava em nenhuma.

---

## 4. Tabela de estado

| Peca | Localizacao | Estado | Detalhes |
|---|---|---|---|
| Edge Function `source-webhook` | `supabase/functions/source-webhook/index.ts` | **Parcial** | Cria lead corretamente no schema veltzy, mas sem automacoes, sem deal, sem auth, sem logging |
| Schema routing (veltzy vs public) | source-webhook linhas 23-24 | **Completo** | Dois clients corretos: veltzy para dominio, public para auth |
| Tabela `leads` | veltzy.leads | **Completo** | Insercao correta com todos os campos basicos |
| Tabela `lead_sources` | veltzy.lead_sources | **Completo** | Funcional, CRUD no frontend, seeded com sistema (whatsapp, instagram, manual) |
| Tabela `source_integrations` | veltzy.source_integrations | **Falta** | Tabela existe, service existe, mas NADA usa para webhook config |
| Tabela `pipeline_sources` | veltzy.pipeline_sources | **Falta** | Tabela existe mas e completamente morta (sem leitura/escrita em todo o codebase) |
| Tabela `webhook_logs` | -- | **Nao existe** | Nenhuma tabela dedicada para logging de webhooks recebidos |
| Pipeline routing por origem | -- | **Nao existe** | Todos os leads caem no pipeline default |
| Autenticacao do webhook | source-webhook | **Nao existe** | Sem token, HMAC, rate limit |
| Atribuicao de vendedor | source-webhook linha 57 | **Parcial** | Random simples, sem round-robin, sem filtro por instancia |
| Dispatch de automacoes | source-webhook | **Nao existe** | Nao chama `run-automations` |
| Criacao de deal | source-webhook | **Nao existe** | Nao chama `createDealForLead` |
| Frontend: URL do webhook | `integrations-tab.tsx` | **Parcial** | Mostra URL fixa, sem customizacao por origem/pipeline |
| Frontend: Lead Sources Manager | `lead-sources-manager.tsx` | **Completo** | CRUD funcional de origens |
| Frontend: Mapeamento de campos | `mapping-step.tsx` | **Completo** | Mas so para import CSV, nao para webhook |
| Frontend: Config de webhook por origem | -- | **Nao existe** | Nao ha UI para gerar URL, definir token, escolher pipeline |
| Webhooks de saida (outbound) | `run-automations` switch | **Nao existe** | Tipo definido, label existe, mas sem case no switch, sem UI selecionavel |
| Logging estruturado | source-webhook catch | **Falta** | Catch-all generico sem console.error |
| Normalizacao de telefone | `_shared/phone.ts` | **Completo** | Funcional, remove formatacao, adiciona 55 |

---

## 5. Recomendacao: o que construir, em que ordem

### Fase A -- Tornar o webhook atual robusto (pre-requisito)

| # | Item | Esforco | Arquivos |
|---|---|---|---|
| A1 | Adicionar dispatch `run-automations` com trigger `lead_created` no source-webhook | P | `source-webhook/index.ts` |
| A2 | Adicionar criacao de deal (`createDealForLead` ou logica simplificada) | P | `source-webhook/index.ts` |
| A3 | Fix: trocar `.single()` por `.maybeSingle()` no fallback pipeline + retornar 400 se nao existir | P | `source-webhook/index.ts` |
| A4 | Adicionar logging estruturado (`console.error` com tags `[source-webhook]`) | P | `source-webhook/index.ts` |
| A5 | Gravar em `activity_logs` quando lead e criado/atualizado | P | `source-webhook/index.ts` |

**Esforco total Fase A:** ~2h de codigo + testes

### Fase B -- Autenticacao e pipeline routing

| # | Item | Esforco | Arquivos |
|---|---|---|---|
| B1 | Criar token unico por `source_integration` (UUID no `config.webhook_token`) | M | migration nova + `source-webhook/index.ts` |
| B2 | source-webhook valida token via header `X-Webhook-Token` ou query param `token` | M | `source-webhook/index.ts` |
| B3 | Pipeline routing: ler `source_integrations.config.pipeline_id` e usar como destino em vez do default | M | `source-webhook/index.ts` |
| B4 | Se `pipeline_sources` nao faz sentido, dropar tabela. Se faz, integrar ao routing | P | avaliacao |

**Esforco total Fase B:** ~4h

### Fase C -- Frontend de configuracao

| # | Item | Esforco | Arquivos |
|---|---|---|---|
| C1 | Componente `WebhookIntegrationCard`: listar webhooks configurados por origem | M | novo em `src/components/admin/` |
| C2 | Modal de criacao: escolher origem (lead_source), pipeline destino, gerar token, mostrar URL pronta com botao copiar | M | novo em `src/components/admin/` |
| C3 | Preview do payload esperado (JSON de exemplo) | P | inline no modal |
| C4 | Mapeamento de campos do payload externo -> campos do lead (opcional, usa `source_integrations.config.field_mapping`) | G | novo componente + logica no source-webhook |
| C5 | Teste de webhook inline (botao "Enviar teste" que faz POST e mostra resultado) | M | componente + logica |

**Esforco total Fase C:** ~8h

### Fase D -- Observabilidade e webhooks de saida

| # | Item | Esforco | Arquivos |
|---|---|---|---|
| D1 | Criar tabela `veltzy.webhook_logs` (id, company_id, direction, source_integration_id, payload, status, error, ip, created_at) | M | migration nova |
| D2 | source-webhook grava log de cada request recebido | P | `source-webhook/index.ts` |
| D3 | Frontend: historico de webhooks recebidos por integracao | M | novo componente |
| D4 | Implementar `send_webhook` no `run-automations` switch | M | `run-automations/index.ts` |
| D5 | UI para selecionar `send_webhook` na automation-rule-modal | P | `automation-rule-modal.tsx` |
| D6 | Config de webhook de saida: URL destino, secret para HMAC, payload template | M | modal + service |
| D7 | Retry com backoff para webhooks de saida (3 tentativas) | M | `run-automations/index.ts` |
| D8 | Rate limiting por empresa no source-webhook (usar `source_integrations.config.rate_limit` ou Supabase rate limit nativo) | M | migration + `source-webhook/index.ts` |

**Esforco total Fase D:** ~12h

### Legenda de esforco
- **P** (Pequeno): < 1h
- **M** (Medio): 1-3h
- **G** (Grande): 3-6h

### Ordem recomendada

```
Fase A (robustez)  -->  Fase B (auth + routing)  -->  Fase C (frontend)  -->  Fase D (observabilidade + outbound)
     2h                       4h                          8h                         12h
```

Fase A deve ser feita antes de qualquer feature nova porque os gaps C1 e C2 (sem automacoes, sem deal) afetam leads que ja entram hoje via webhook.
