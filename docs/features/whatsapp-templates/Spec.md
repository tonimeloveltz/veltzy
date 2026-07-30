# Spec — Mensagens Template (HSM) do WhatsApp Cloud API

> Fase 2 do SDD. Deriva de `PRD-templates.md`. Define O QUE será implementado, arquivo por arquivo, com critérios de aceite por bloco. Implementação pela codificadora do Veltzy (git flow feat→develop→main), PVO ao fim de cada bloco.

## 0. Arquitetura em camadas

```
Front Veltzy ──► Edge Functions Veltzy ──(m2m)──► Edge Functions Hub ──► Graph API v25.0 (Meta)
  (RLS, sem token)   (auth user, resolve waba_id)   (resolve token, chama Meta)

Webhook Meta ──► cloud-api-inbound (Veltzy, Central) ──► UPDATE veltzy.whatsapp_templates
```
Regra de ouro (herdada da coexistência): **o token vive só no Hub**; o Veltzy passa `waba_id`/`phone_number_id`+`company_id` e o Hub chama a Meta.

## 1. Banco (migration — já escrita, NÃO aplicada)
`hub/supabase/migrations/20260730120000_veltzy_whatsapp_templates_e_consent.sql`
- `veltzy.whatsapp_templates` (catálogo; gate de envio = APPROVED; alvo do webhook).
- `veltzy.lead_consents` (consentimento versionado; gate de MARKETING).
- RLS padrão veltzy, índices, trigger `handle_updated_at`, `NOTIFY pgrst`.
- **Aplicação:** manual pelo Toni (§9 do PRD).

## 2. Types (transversal) — `src/types/`
- `whatsapp-template.ts`: `WhatsAppTemplate` (espelha a tabela), `TemplateComponent` (HEADER/BODY/FOOTER/BUTTONS), `TemplateStatus`, `TemplateCategory`, `QualityRating`, `TemplateVariable`.
- `lead-consent.ts`: `LeadConsent`, `ConsentPurpose='marketing_whatsapp'`, `ConsentOrigin`.
- Estender `SendMessagePayload` (`types/database.ts`): campo opcional `template?: { templateId: string; name: string; language: string; parameters: string[] }`.

---

## Bloco (a) — Listar templates da Meta

### Edge Functions
- **NOVO** `supabase/functions/cloud-api-templates/index.ts` (Veltzy, proxy): auth do user (padrão `cloud-api-onboard-proxy`), resolve `waba_id` da empresa via `veltzy.cloud_api_numbers`, chama o Hub. Actions: `list`, `create` (bloco c).
- **NOVO no Hub** `supabase/functions/cloud-api-templates/index.ts`: m2m (service_role), resolve token em `public.cloud_api_credentials`, chama Graph:
  - `GET /v25.0/{waba_id}/message_templates` (list).
  - `POST /v25.0/{waba_id}/message_templates` (create — bloco c).
- **Sync:** o proxy Veltzy faz upsert em `veltzy.whatsapp_templates` (conflito por `company_id,waba_id,name,language`) a partir da resposta da Meta (status, quality, components, meta_template_id).

### Front
- `src/services/whatsapp-templates.service.ts` — `listTemplates(companyId)` (lê tabela local), `syncFromMeta()` (invoca a Edge Function).
- `src/hooks/use-whatsapp-templates.ts` — query dos templates + mutation de sync.
- `src/components/admin/whatsapp-templates-manager.tsx` — lista com status + `quality_rating` (badge verde/amarelo/vermelho), botão "Sincronizar".
- `src/components/admin/whatsapp-connect-choice.tsx` — **MODIFICAR**: quando oficial conectado, sub-abas "Números" / "Templates" (renderiza o manager).

### Critérios de aceite
- [ ] Lista os templates reais da WABA na tela Admin (sub-aba Templates).
- [ ] Status refletido incl. **PAUSED/DISABLED**; `quality_rating` como badge.
- [ ] RLS: empresa só vê os seus templates.
- [ ] Loading (skeleton) / empty / error (retry).

---

## Bloco (b) — Enviar template aprovado

### Edge Functions (estender, não criar)
- `supabase/functions/whatsapp-send/index.ts` — no bloco `cloud_api`, aceitar `payload.template`; montar envio de template.
- `supabase/functions/_shared/providers/cloud-api.ts` — `sendMessage()` monta `{ type:'template', template:{ name, language:{code}, components:[{type:'body',parameters}] } }` quando há template.
- **Hub** `cloud-api-send-message` — aceitar `message.template` e repassar ao Graph (mesmo endpoint `/{phone_number_id}/messages`).

### Regras de negócio (gate de envio)
- Template deve ser `APPROVED` (bloquear PENDING/IN_REVIEW/REJECTED/**PAUSED**/**DISABLED**).
- Nº de variáveis preenchidas = nº de `{{n}}` no BODY (senão erro "variável faltando").
- MARKETING: exige `lead_consents` válido (bloco de consentimento). UTILITY/AUTH: não.
- `wamid` retornado → grava `veltzy.messages` (sender_type='human' ou 'ai' conforme origem; external_id=wamid).

### Front
- `src/services/messages.service.ts` — `routeMessage()` aceita `template` no payload → repassa a `whatsapp-send`.
- `src/hooks/use-messages.ts` — `useSendMessage()` aceita template.
- Erros amigáveis (§7.2 do PRD) mapeados no catch da mutation (toast claro, não erro cru).

### Critérios de aceite
- [ ] Envia template APPROVED com variáveis; `wamid` em `messages.external_id`.
- [ ] Bloqueia PAUSED/DISABLED com mensagem clara.
- [ ] Variável faltando bloqueada com mensagem clara.
- [ ] Erro da Meta tratado (msg + fbtrace_id no log).

---

## Bloco (c) — Criar template + submissão

### Front
- `src/components/admin/whatsapp-template-form.tsx` — form: categoria (UTILITY/MARKETING/AUTH), idioma, BODY com detecção de `{{1}}..{{n}}` + exemplos, HEADER (TEXT/IMAGE opcional), BUTTONS opcional.
- `src/services/whatsapp-templates.service.ts` — `createTemplate(payload)` → Edge Function `cloud-api-templates` action `create`.
- Validações: `name` lowercase_underscore (≤512), variáveis sequenciais a partir de 1, exemplo obrigatório para cada variável.
- Ao criar: grava linha local `PENDING` (o webhook do bloco d atualiza).

### Critérios de aceite
- [ ] Cria e submete à Meta; linha local PENDING criada.
- [ ] Validações client-side (nome, variáveis, exemplos).
- [ ] Erro de validação da Meta exibido (ex.: categoria mis-tag auto-rejeitada).

---

## Bloco (d) — Webhook de status

### Edge Function (estender)
- `supabase/functions/cloud-api-inbound/index.ts` — tratar `change.field === 'message_template_status_update'`:
  - resolver empresa por `waba_id` (via `veltzy.cloud_api_numbers` / `whatsapp_templates`); ignorar evento de tenant não cadastrado.
  - **Chave do UPDATE:** `WHERE meta_template_id = ?` (globalmente único na Meta). **Fallback** só se o `meta_template_id` não vier no payload: `WHERE company_id = ? AND name = ? AND language = ?` (nunca só name+language, pra não atualizar linha de outra empresa). SET `status`, `quality_rating`, `rejected_reason`.
  - Best-effort, responde 200 (não derruba o webhook de mensagens).

### Critérios de aceite
- [ ] Approved/Rejected/**Paused/Disabled** refletem em `whatsapp_templates.status` sem refresh manual.
- [ ] `rejected_reason` e `quality_rating` gravados.
- [ ] Evento de tenant desconhecido ignorado (log, 200).

---

## Bloco (e) — Seletor no Inbox (ENTREGA OBRIGATÓRIA) + janela 24h

### Front
- `src/hooks/use-conversation-window.ts` — `janelaAberta` = existe `messages` do lead com **`is_history=false` AND `sender_type='lead'` AND `created_at > now()-24h`** (regra cravada no PRD §7.1; `is_history=false` exclui o dump importado, cujo `created_at` é a data de importação; echo `human` não conta).
- `src/components/inbox/chat-input.tsx` — **MODIFICAR**:
  - janela ABERTA → texto livre normal + botão de template disponível.
  - janela FECHADA → desabilita texto livre, banner "só template", **destaca o seletor**.
- `src/components/inbox/template-selector-popover.tsx` — **NOVO**: lista só APPROVED **e `language='pt_BR'`** (multi-idioma no seletor é fase futura — evita ambiguidade quando o mesmo template existe em mais de um idioma); preview; ao escolher, abre coleta de variáveis.
- `src/components/inbox/template-variables-form.tsx` — **NOVO**: preenche `{{n}}`, preview com valores; dispara `useSendMessage` com `template`.
- Gate de MARKETING: antes de enviar, checa `useLeadConsent(leadId,'marketing_whatsapp')`; sem opt-in → bloqueia com CTA "Registrar opt-in".

### Critérios de aceite
- [ ] Seletor mostra só APPROVED.
- [ ] Janela fechada → texto livre desabilitado, seletor destacado; janela aberta → texto livre ok.
- [ ] MARKETING sem opt-in bloqueado com mensagem/CTA claros.
- [ ] Variáveis preenchidas + preview antes de enviar; envio pelo caminho do bloco (b).

---

## Bloco transversal — Consentimento (nasce com b/e)

### Front + service
- `src/services/lead-consents.service.ts` — `getValidConsent(leadId, finalidade)`, `grantConsent(payload)`, `revokeConsent(id)` (preenche `revogado_em`, não apaga).
- `src/hooks/use-lead-consent.ts` — query do consentimento válido + mutations grant/revoke.
- `src/components/inbox/lead-consent-dialog.tsx` — registrar opt-in (finalidade, termo_versao, texto_aceito, origem).

### Critérios de aceite
- [ ] Registrar opt-in cria linha em `lead_consents` (revogado_em NULL).
- [ ] Revogar preenche `revogado_em` sem apagar (histórico preservado).
- [ ] Gate de MARKETING lê corretamente (com/sem consentimento válido).
- [ ] RLS isola por empresa.

---

## Lista consolidada de arquivos

**Novos (Edge Functions):** `veltzy/functions/cloud-api-templates/`, `hub/functions/cloud-api-templates/`.
**Modificados (Edge Functions):** `veltzy/functions/whatsapp-send`, `veltzy/functions/_shared/providers/cloud-api.ts`, `veltzy/functions/cloud-api-inbound`, `hub/functions/cloud-api-send-message`.
**Novos (front):** types (`whatsapp-template.ts`, `lead-consent.ts`); services (`whatsapp-templates.service.ts`, `lead-consents.service.ts`); hooks (`use-whatsapp-templates.ts`, `use-lead-consent.ts`, `use-conversation-window.ts`); components (admin: `whatsapp-templates-manager.tsx`, `whatsapp-template-form.tsx`; inbox: `template-selector-popover.tsx`, `template-variables-form.tsx`, `lead-consent-dialog.tsx`).
**Modificados (front):** `chat-input.tsx`, `whatsapp-connect-choice.tsx`, `messages.service.ts`, `use-messages.ts`, `types/database.ts`.

## Referência cruzada
- Atualizar `docs/SPECS.md` com link para este Spec.
- PRD: `docs/features/whatsapp-templates/PRD-templates.md`.
- Migration: `hub/supabase/migrations/20260730120000_veltzy_whatsapp_templates_e_consent.sql`.

## Testes (por bloco)
- Unit (Vitest): services (mapping/validação/gates), hooks (janela 24h, consentimento).
- E2E (Playwright): listar → criar → (status via webhook simulado) → enviar pelo seletor com janela fechada e com gate de opt-in.
- PVO ao fim de cada bloco: `npm run build` verde + verificação visual/banco (Copiloto conduz).
