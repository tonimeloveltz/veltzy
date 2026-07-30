# PRD — Mensagens Template (HSM) do WhatsApp Cloud API

> Feature nova. Fase 1 do SDD (pesquisa + PRD). Autor: Copiloto. Data: 2026-07-30.
> Papel do Copiloto: escreve docs (PRD/Spec) e a migration no repo do Hub (arquivo), NÃO aplica no banco. Quem aplica é o Toni.
> **Revisão 2 (2026-07-30):** incorpora os ajustes do Toni — status Paused/Disabled + quality_rating, erros de envio amigáveis, seletor no Inbox obrigatório e sensível à janela de 24h, opt-in de MARKETING bloqueante na Fase 1, esquema de consentimento versionado, limites conhecidos, migration com 2 objetos, git flow pela codificadora.

## 1. Problema e contexto de negócio

O Veltzy opera em **coexistência** (número no app WhatsApp Business do cliente + Cloud API oficial ao mesmo tempo). Nesse modo, **duas restrições da Meta** tornam esta feature indispensável:

1. Fora da **janela de atendimento de 24h**, e para **qualquer mensagem proativa** (disparo, follow-up, campanha), o WhatsApp só entrega **template aprovado** (HSM — Highly Structured Message).
2. No número em coexistência, **template só sai pela API** — o app do celular do dono **não dispara template**. Logo, esta feature é o **único caminho** do cliente para mensagens proativas nesse número.

### Escopo Fase 1 (completa)
- **Criar** template (UTILITY/MARKETING/AUTHENTICATION, idioma, corpo com variáveis, header e botões opcionais) com submissão à Meta.
- **Refletir status** (In-Review/Approved/Rejected **+ Paused/Disabled**) e **qualidade** via webhook `message_template_status_update`.
- **Listar** os templates da WABA.
- **Enviar** template aprovado (variáveis preenchidas) a partir de uma conversa — **com gate de janela de 24h e gate de opt-in de MARKETING**.
- **Consentimento versionado** por titular/finalidade (gate de MARKETING consulta este registro).

### Localização na UI
- **Gestão:** Admin > Integrações, sub-área **"Templates"** dentro do canal **WhatsApp API Oficial** (ao lado de "Números").
- **Uso (seletor de template):** Inbox, na **barra de composição** da conversa, **sensível ao estado da janela de 24h**.

---

## 2. Estado atual do Veltzy (reaproveitado)

### 2.1 Envio pela Cloud API hoje (o template reaproveita este caminho)
```
Composer (chat-input.tsx) → useSendMessage (use-messages.ts:64) → routeMessage (messages.service.ts:173)
  → whatsapp-send → [cloud_api] resolveOutboundCloudApiNumber (_shared/cloud-api-resolve.ts:61)
    → CloudApiHubProvider.sendMessage (_shared/providers/cloud-api.ts:28)
      → POST {HUB_URL}/functions/v1/cloud-api-send-message (m2m)
        → Hub: POST https://graph.facebook.com/v25.0/{phone_number_id}/messages → { wamid }
```
- **Mesmo endpoint** para texto/mídia **e template** (`POST /{phone_number_id}/messages`); muda só o corpo (`type:"template"`). **Graph v25.0** (confirmado, `src/lib/meta-embedded-signup.ts:6`).
- `whatsapp-send` (`supabase/functions/whatsapp-send/index.ts:156-188`), `CloudApiHubProvider` (`_shared/providers/cloud-api.ts:28-73`).
- **Token nunca sai do Hub:** Veltzy passa `phone_number_id`+`company_id`; o Hub resolve o token em `public.cloud_api_credentials`.

### 2.2 Inbox e composer
- Composer: `src/components/inbox/chat-input.tsx` — `handleSend()` (:40) → `useSendMessage()`. Estrutura `ChatWindow → ChatHeader → MessageList → ChatInput`.
- Ponto de extensão do seletor HSM: `chat-input.tsx:120-125` (ao lado do `ReplyTemplatesPopover`, que é resposta rápida **interna**, não HSM).
- **Fonte da janela de 24h:** `veltzy.messages` (tem `sender_type`, `created_at`, `lead_id`). A última mensagem **recebida do contato** = `MAX(created_at) WHERE lead_id=? AND sender_type='lead'`.

### 2.3 Admin > Integrações
- Container: `src/components/admin/integrations-tab.tsx` (Tabs channels/calendar/webhooks/payments). Canal WhatsApp: `WhatsAppConnectChoice` (`whatsapp-connect-choice.tsx:21`). Gestão de templates entra como **sub-área "Templates"** quando o oficial está conectado.

### 2.4 Credenciais da WABA
| Dado | Onde | Uso na feature |
|---|---|---|
| `phone_number_id` | `veltzy.cloud_api_numbers.phone_number_id` (UNIQUE) | envio (`/{phone_number_id}/messages`) |
| `waba_id` | `veltzy.cloud_api_numbers.waba_id` **e** `public.cloud_api_credentials.waba_id` | **Template API** (criar/listar é por WABA) |
| `access_token` (real) | **`public.cloud_api_credentials.access_token`** (Hub) | token da Meta; nunca no front |

> Toda chamada à Template API (criar/listar) é **por WABA e precisa do token → roda no Hub**. O front só fala com Edge Functions do Veltzy, que delegam ao Hub (como o envio já faz).

---

## 3. Leitura do Hub (schema do Central)

- Migrations do Hub são timestamp-based; o **Hub mantém migrations do schema `veltzy`** (ledger por banco). Molde recente e canônico: `20260726000000_veltzy_origem_por_pipeline.sql` (cria `veltzy.pipeline_routing_rules`).
- **Não existe nenhuma tabela de templates/HSM nem de consentimento hoje** (grep por `template`/`hsm`/`consent` nas migrations do Hub e do Veltzy só acha `veltzy.reply_templates`, que é resposta rápida interna). **Ambos os objetos desta feature são NOVOS.**
- Credenciais: `public.cloud_api_credentials` (token real + `waba_id`) e espelho `veltzy.cloud_api_numbers` (token NULL). Confirmado.

### 3.1 Padrão RLS/isolamento veltzy (a reaproveitar)
- Empresa atual: `veltzy.get_current_company_id()`. Autorização: `veltzy.is_super_admin()`, `veltzy.is_company_admin()`. Trigger: `veltzy.handle_updated_at()`.
- SELECT: `company_id = get_current_company_id() OR is_super_admin()`. Write: `company_id = get_current_company_id() AND (is_company_admin() OR is_super_admin())`.
- Idempotência (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), índices em `company_id`, `NOTIFY pgrst, 'reload schema';` ao final.

---

## 4. Documentação da Meta — Message Templates API (Graph v25.0)

### 4.1 Criar
`POST /v25.0/{waba_id}/message_templates` (Bearer do token da WABA, no Hub). Body: `name` (lowercase+underscore, ≤512), `language`, `category` (UTILITY/MARKETING/AUTHENTICATION), `parameter_format`, `components[]` (HEADER TEXT/IMAGE, BODY com `{{1}}`+`example`, FOOTER, BUTTONS URL/QUICK_REPLY). Retorna `{ id, status, category }`. Rate limit: **100 templates/WABA/hora**.

### 4.2 Listar
`GET /v25.0/{waba_id}/message_templates` → `{ data:[{ id, name, status, category, language, components, quality_score }] }`.

### 4.3 Status e qualidade
- **Status:** `APPROVED`, `PENDING`/`IN_REVIEW`, `REJECTED`, **`PAUSED`**, **`DISABLED`**, `APPEAL_REQUESTED`. Só `APPROVED` envia. Review até 24h.
- **PAUSED/DISABLED:** a Meta **pausa** (temporário) ou **desabilita** (permanente) um template **já aprovado** quando a **qualidade cai** (feedback negativo/baixa leitura). O webhook dispara nesses casos → a linha local **tem que refletir**, senão a UI mostra "aprovado" um template que já falha no envio.
- **Qualidade:** `quality_score` GREEN/YELLOW/RED (mapeado para verde/amarelo/vermelho na UI).

### 4.4 Enviar template
`POST /v25.0/{phone_number_id}/messages`:
```json
{ "messaging_product":"whatsapp", "to":"5511999990000", "type":"template",
  "template": { "name":"confirmacao_pedido", "language":{"code":"pt_BR"},
    "components":[ { "type":"body", "parameters":[ {"type":"text","text":"João"}, {"type":"text","text":"12345"} ] } ] } }
```
Retorna `{ messages:[{ id: wamid }] }` → grava em `veltzy.messages.external_id`.

### 4.5 Webhook `message_template_status_update`
Campo de webhook da WABA, no **mesmo callback do app** (`.../cloud-api-inbound` no Central); **precisa ser assinado no painel** (§11). Dispara em aprovação, rejeição **e** pausa/desabilitação/mudança de qualidade. Campos: `message_template_id`, `message_template_name`, `message_template_language`, `event`/novo status, motivo (rejeição), e evento de qualidade. Payload exato fixado na Spec (doc de Webhooks + evento real no PVO).

### 4.6 Opt-in por categoria (política da Meta)
A Meta exige **opt-in explícito antes de enviar template**; **MARKETING** é a categoria mais rígida (a Meta checa sinais de opt-in prévio e conta contra os limites de marketing). **UTILITY** (transacional: confirmações, updates) e **AUTHENTICATION** (OTP/login) têm natureza de relacionamento/serviço e revisão mais folgada. → Gate de opt-in **bloqueante para MARKETING** (§6).

---

## 5. Modelo de dados (2 objetos NOVOS, migration no Hub)

### 5.1 `veltzy.whatsapp_templates` (catálogo espelhado)
```sql
CREATE TABLE IF NOT EXISTS veltzy.whatsapp_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cloud_api_number_id UUID REFERENCES veltzy.cloud_api_numbers(id) ON DELETE CASCADE,
  waba_id             TEXT NOT NULL,
  meta_template_id    TEXT,
  name                TEXT NOT NULL,
  language            TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','PAUSED','DISABLED')),
  quality_rating      TEXT CHECK (quality_rating IN ('GREEN','YELLOW','RED')),  -- verde/amarelo/vermelho
  components          JSONB NOT NULL,   -- header/body/footer/buttons (preview + nº de variáveis)
  rejected_reason     TEXT,
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, waba_id, name, language)   -- isolado por tenant
);
```
Só APPROVED (e não PAUSED/DISABLED) pode ser enviado — gate no envio (§7 bloco b). O webhook (bloco d) atualiza a linha por **`meta_template_id`** (globalmente único na Meta), com `name`+`language` só como fallback — evita atualizar a linha da empresa errada.

### 5.2 `veltzy.lead_consents` (consentimento versionado — molde LGPD)
Segue o padrão do anexo LGPD (skill lgpd §2 "Consentimento versionado": titular + versão do termo + granted/revoked + finalidade; revogação **não apaga**). Nomes de coluna conforme pedido:
```sql
CREATE TABLE IF NOT EXISTS veltzy.lead_consents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES veltzy.leads(id) ON DELETE CASCADE,   -- titular
  finalidade     TEXT NOT NULL,                 -- ex: 'marketing_whatsapp'
  termo_versao   TEXT NOT NULL,                 -- versão do termo aceito
  texto_aceito   TEXT,                          -- texto que o titular aceitou
  origem         TEXT NOT NULL CHECK (origem IN ('formulario','campanha','importacao','manual')),
  canal          TEXT NOT NULL DEFAULT 'whatsapp',
  consentido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em    TIMESTAMPTZ,                   -- NULL até revogar; revogar NÃO apaga a linha
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- gate consulta: existe consentimento válido (revogado_em IS NULL) para (company, lead, finalidade)?
CREATE INDEX IF NOT EXISTS idx_lead_consents_valid
  ON veltzy.lead_consents (company_id, lead_id, finalidade) WHERE revogado_em IS NULL;
```
Ambas com RLS no padrão veltzy (SELECT membros; write admin), trigger `handle_updated_at()`, `NOTIFY pgrst`. **SQL completo na migration** (§11).

**Novo vs consumido:** NOVOS = `whatsapp_templates`, `lead_consents`. CONSUMIDOS (sem alteração) = `cloud_api_numbers`, `cloud_api_credentials`, `messages` (external_id + janela 24h), `leads`.

---

## 6. LGPD — opt-in bloqueante e consentimento

### 6.1 Base legal por categoria (a validar com jurídico; não presumir — skill lgpd §1)
| Categoria | Natureza | Base legal LGPD sugerida | Gate no envio |
|---|---|---|---|
| **MARKETING** | Promocional/reengajamento | **Consentimento** (art. 7, I) | **BLOQUEANTE**: exige `lead_consents` válido para `marketing_whatsapp` |
| **UTILITY** | Transacional (confirmações, updates) | Execução de contrato / legítimo interesse (art. 7, V/IX) | Não bloqueia por opt-in de marketing; segue regra da Meta |
| **AUTHENTICATION** | OTP/login | Execução de contrato / segurança (art. 7, V) | Não bloqueia por opt-in de marketing |

### 6.2 Gate de opt-in (Fase 1, bloqueante)
- Enviar template **MARKETING** consulta `veltzy.lead_consents`: precisa existir consentimento com `finalidade='marketing_whatsapp'` e `revogado_em IS NULL` para aquele lead/empresa. **Sem opt-in → envio bloqueado com mensagem clara** (§7.2).
- UTILITY/AUTHENTICATION não passam por esse gate (seguem a regra própria da Meta).
- Revogação preenche `revogado_em` (não apaga), preservando histórico para prova (art. 18, IX).

### 6.3 Demais controles
- **Dados pessoais:** o catálogo (`whatsapp_templates`) guarda só metadados (texto genérico com `{{1}}`), sem PII. A PII aparece só nas **variáveis do envio**, já persistidas em `veltzy.messages` (como hoje). Minimização respeitada.
- **RLS/isolamento:** ambas as tabelas por `company_id`, padrão veltzy. Token da WABA nunca no front. Envio valida que o template pertence à empresa do lead.

---

## 7. Estados da UI e tratamento de erros

### 7.1 Sensibilidade à janela de 24h (seletor no Inbox)
Regra cravada (mensagem importada do history também é `sender_type='lead'`, então filtrar por sender_type não basta):
```
janelaAberta = EXISTS (
  SELECT 1 FROM veltzy.messages
  WHERE lead_id = ?
    AND is_history = false          -- exclui o dump importado
    AND sender_type = 'lead'        -- recebida do contato
    AND created_at > now() - interval '24 hours'
)
```
**Achado (investigado no código):** o `processHistory` (`cloud-api-inbound/index.ts:378-398`) grava as mensagens de history com `created_at = now()` (data da **importação**), pois o handler não seta `created_at` (usa `DEFAULT now()`) e o `m.timestamp` original da Meta é ignorado. **A janela é robusta assim mesmo** porque o filtro `is_history = false` exclui todo o dump — o `created_at` de importação nunca contamina o cálculo. Echo (`sender_type='human'`) também não conta (não abre janela).
> **Débito registrado (fora do escopo desta feature):** a data original das mensagens de history não é preservada (todas ficam com a data de importação), o que afeta ordenação/exibição do history — **não a janela**. Se virar requisito, criar coluna `original_sent_at` alimentada por `m.timestamp`.
- **Janela ABERTA:** atendente escreve **texto livre** normalmente; seletor de template disponível como opção.
- **Janela FECHADA (ou sem inbound):** a interface deixa claro que **só template aprovado** pode ser enviado, **desabilita o texto livre** e **destaca o seletor**. O atendente nunca tenta texto livre e falha sem entender.

### 7.2 Erros de envio amigáveis (não erro cru)
| Situação | Mensagem ao atendente |
|---|---|
| Template PAUSED/DISABLED | "Este template está pausado/desabilitado pela Meta (qualidade). Escolha outro ou aguarde a reativação." |
| Variável faltando | "Preencha todas as variáveis do template ({{n}}) antes de enviar." |
| MARKETING sem opt-in | "Este contato não tem consentimento para marketing. Registre o opt-in ou use um template de utilidade." |
| Fora da janela + texto livre | "A janela de 24h fechou. Só é possível enviar um template aprovado." |
| Erro genérico da Meta | Mensagem clara + `fbtrace_id` no log (não exibir cru). |

---

## 8. Ordem de implementação (blocos) + critérios de aceite

PVO ao fim de cada bloco (build + verificação visual/banco), conduzido pelo Copiloto.

| Bloco | Escopo | Critérios de aceite |
|---|---|---|
| **(a) Listar** | Function `GET /{waba_id}/message_templates` via Hub + sync para `veltzy.whatsapp_templates`; tela Admin lista com status **e qualidade**. | [ ] Lista templates reais. [ ] Status (incl. Paused/Disabled) e quality_rating refletidos. [ ] RLS por empresa. [ ] Loading/empty/error. |
| **(b) Enviar aprovado** | Estender `whatsapp-send`+`CloudApiHubProvider`+Hub `cloud-api-send-message` para `type:template` com variáveis; **gate de status** (só APPROVED) e **erros amigáveis** (§7.2). | [ ] Envia APPROVED com variáveis. [ ] wamid em `messages.external_id`. [ ] Bloqueia PAUSED/DISABLED com msg clara. [ ] Variável faltando tratada. |
| **(c) Criar + submissão** | Form Admin (categoria, idioma, corpo com variáveis, header/botões opcionais) → `POST /{waba_id}/message_templates` via Hub → linha PENDING. | [ ] Cria e submete. [ ] Validações (nome, variáveis sequenciais, exemplo). [ ] PENDING local. [ ] Erro da Meta exibido. |
| **(d) Webhook status** | Estender `cloud-api-inbound` para `message_template_status_update` → atualiza `status`/`quality_rating`/`rejected_reason`. | [ ] Approved/Rejected/**Paused/Disabled** refletem sem refresh. [ ] rejected_reason gravado. [ ] Evento de tenant errado ignorado. |
| **(e) Seletor no Inbox** — **ENTREGA OBRIGATÓRIA** | Botão/dropdown na barra de composição: lista APPROVED, preview, coleta variáveis, **gate de janela 24h (§7.1)** e **gate de opt-in MARKETING (§6.2)**, dispara envio (bloco b). | [ ] Seletor só APPROVED. [ ] Janela fechada → texto livre desabilitado, seletor destacado. [ ] MARKETING sem opt-in bloqueado. [ ] Variáveis preenchidas + preview. |

Bloco de suporte transversal (nasce junto de (b)/(e)): **consentimento** — registrar/revogar opt-in por lead/finalidade em `lead_consents`, e o gate de MARKETING consultando-o.

---

## 9. Fora de escopo (Fase 1) e limites conhecidos

**Fora de escopo:** disparo em massa/campanha para listas (Fase 1 é 1:1 a partir da conversa); agendamento/filas/cadência; edição/versionamento de template aprovado; header de vídeo/documento/localização e botões dinâmicos; multi-WABA por empresa no seletor (piloto = 1 número); UI dedicada de gestão de consentimento em massa (Fase 1 registra/consulta/revoga por lead); **multi-idioma no seletor do Inbox** (Fase 1 filtra `pt_BR`; ver §7.1/Spec bloco e).

> **Limitação conhecida do opt-in (não é bug):** o gate de opt-in de MARKETING cobre os envios **feitos pelo Veltzy**. Em coexistência, o dono também pode disparar manualmente **pelo app do celular**, fora do controle do sistema — esses envios **não passam pelo gate** e não são interceptáveis pelo Veltzy. O consentimento do titular continua sendo responsabilidade do cliente nesse caminho.

**Limites conhecidos (nota, não implementar agora):** a WABA tem **teto de quantidade de templates** e **rate limit de criação/edição** (100/hora); relevante em cenário **multi-tenant** onde vários clientes criam templates na mesma infra. Monitorar e, se necessário, enfileirar/limitar criação por empresa em fase futura.

---

## 10. Fluxo de implementação

A feature mexe no **`cloud-api-inbound`** (crítico para a coexistência recém-provada) e no **Inbox em produção**. Portanto:
- Implementação **pela codificadora do Veltzy**, com **git flow `feat → develop → main`** (sem implementação direta na main, sem pular o controle).
- Migration escrita pelo Copiloto no **repo do Hub** (arquivo, não aplicada).
- **PVO ao fim de cada bloco** (a→e), conduzido pelo Copiloto (build verde local + verificação visual/banco). Deploy de Edge Function e aplicação de migration são ações do Toni (autorização humana direta).

---

## 11. Aplicação manual do Toni

1. **Migration (arquivo NOVO no repo do Hub, NÃO aplicada):**
   - Caminho: `hub/supabase/migrations/<timestamp>_veltzy_whatsapp_templates_e_consent.sql`
   - Conteúdo: **dois objetos** — `veltzy.whatsapp_templates` (§5.1) e `veltzy.lead_consents` (§5.2), ambos no padrão veltzy (RLS, índices, trigger `handle_updated_at`, `NOTIFY pgrst`). Arquivo novo, **sem editar baseline nem `_archive`**.
   - O Toni revisa e aplica **manualmente** via SQL Editor do Central (ou `db push` consciente, link confirmado só naquele momento). **O Copiloto não aplica** (nada de `db push`/`pull`/`repair` de nenhuma janela).
2. **Config de webhook no painel da Meta (ação do Toni):**
   - Assinar o campo **`message_template_status_update`** na WABA/app (App Dashboard → WhatsApp → Configuração → Campos do webhook), além dos já assinados na Onda 3.
   - Callback já é o do Central (`.../functions/v1/cloud-api-inbound`), sem alteração.

---

## Fontes
- [Template fundamentals — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [Template categorization — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Webhooks overview — Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- Skill LGPD do projeto: `~/.claude/skills/lgpd/mapa-controles.md` §1 (base legal), §2 (consentimento versionado), §3 (RLS/minimização).
- Código Veltzy e schema Hub (§2, §3).
