# SPEC — Corte A: HSM Cloud API (disparo em massa via canal OFICIAL)

> Continuação da frente mkt-ativo (Fase 1 landada dark, PR #193). Objetivo: a `blast-dispatch` passa a PERMITIR `cloud_api` (hoje recusa com 'cloud_api_proximo_corte'), enfileirando em MODO TEMPLATE; o consumidor envia template HSM aprovado via Hub→Meta. Cloud API oficial **NÃO** aplica o §4bis (teto 50/dia, janela) — segue os limites da Meta.
> Copiloto: eep51abp. **Cross-repo:** Perna Veltzy = x5gqtwno (branch `feat/hsm-cloud-api`, base 523db27). Perna Hub = ynrs80x9.
> Testes de validação INTEGRADA (envio real) = bateria final do Toni. TDD + build verde por corte. Landa dark.

---

## Contrato Veltzy → Hub (PONTO DE SINCRONIZAÇÃO das 2 pernas)

`POST {HUB_URL}/functions/v1/cloud-api-send-template`
Headers: `Authorization: Bearer <HUB_SERVICE_KEY>`, `x-veltzy-company-id: <company_id>`, `Content-Type: application/json`
Body:
```
{
  "company_id": "<uuid>",
  "phone_number_id": "<id do número Cloud API>",
  "to": "<E.164 destinatário>",
  "template": {
    "name": "<template name aprovado>",
    "language": "<ex. pt_BR>",
    "components": [
      { "type": "body", "parameters": [ { "type": "text", "text": "<valor resolvido {{1}}>" }, ... ] }
    ]
  }
}
```
Resposta 200: `{ "message_id": "<wamid>", "status": "sent|accepted" }` · Erro: `{ "error": "<msg>", "code": "<código>" }`
(Mesmo padrão de auth dos endpoints Hub existentes: hub-client.ts / cloud-api-send-message / cloud-api-templates.)

**Nota de formato (Graph):** `template.language` no CONTRATO é **STRING** (ex. `pt_BR`, casa com `whatsapp_templates.language` text); o **Hub** a embrulha em `{ code: "pt_BR" }` pra a Graph API (o endpoint aceita string ou `{code}` por robustez, mas o **canônico é string**). `components` casa 1:1 com a Graph.

---

## Perna HUB (ynrs80x9)

- **Endpoint NOVO** `cloud-api-send-template` (NÃO estender o `cloud-api-send-message` de prod — isola risco de regressão no envio normal).
- Recebe o contrato acima → resolve o token da WABA (por `waba_id` de `cloud_api_numbers`, mesmo padrão do `cloud-api-templates`) → `POST` Graph `/{phone_number_id}/messages` com `type=template`.
- Retorna `{message_id, status}` ou erro estruturado (repassar o erro da Meta de forma legível — ex. template não aprovado, param count mismatch).
- TDD; dev/staging do Hub; build verde; fluxo feat/*→PR→develop do Hub. **Deploy no Central = go direto do Toni.**
- ⚠️ Edge Functions são globais por nome no Central — nome distinto garantido (`cloud-api-send-template` novo).

## Perna VELTZY (x5gqtwno)

1. **Migration** (`message_queue`): suportar `message_type='template'` + coluna **`metadata jsonb`** (carrega `template_name`, `language`, `params` por-recipient). Aditiva.
2. **`_shared/providers/cloud-api.ts`**: novo método **`sendTemplate`** → chama o Hub `/cloud-api-send-template` com o contrato.
3. **`process-message-queue`** (⚠️ ESTEIRA DE PROD): ramo **`cloud_api`** novo → resolve `phone_number_id` reusando **`_shared/cloud-api-resolve.ts` (`resolveOutboundCloudApiNumber`)** → se `message_type='template'` monta components e chama `sendTemplate`; senão texto. **Regressão obrigatória** em evolution/waha/zapi (não quebrar os ramos existentes).
4. **`blast-dispatch`**: quando `provider=cloud_api` → **PARA de recusar**; exige `whatsapp_templates.status='APPROVED'` (senão recusa a campanha com motivo claro); enfileira `message_type='template'` + `metadata` com name/language/params **resolvidos por-recipient**; **SEM §4bis** (sem teto 50/janela — espaçamento leve ok). waha/evolution seguem TEXTO + §4bis como hoje.
5. **Frontend**: pra `cloud_api`, o banner de risco §4bis **some** (canal oficial) e mostra "envio por template aprovado"; bloqueia seleção de template não-`APPROVED`.
6. Veltzy pode desenvolver contra o CONTRATO (mock do endpoint Hub) e integrar quando a perna Hub entregar em staging/dev.

---

## Anti-ban / compliance
- `cloud_api` = oficial → **sem** teto 50/dia, sem janela restritiva do §4bis (segue os limites da Meta por tier de template). Espaçamento leve pode ficar.
- waha/evolution = não-oficial → §4bis intacto (como Fase 1).

## Testes / validação
- TDD nas 2 pernas + **regressão dos providers existentes** (evolution/waha/zapi não podem quebrar).
- Validação INTEGRADA (envio real Cloud API com WABA/número de teste) = **bateria final do Toni**.
- Landa **dark**: cloud_api só dispara se a company usa cloud_api E tem `mkt_ativo_enabled`.

## Entrega
- Veltzy: `feat/hsm-cloud-api` → PR develop (dark). Hub: `feat/*` → PR develop do Hub.
- Deploy no Central (Veltzy edge + Hub endpoint) + promoção = **go direto do Toni**.
- Sincronização das pernas pelo CONTRATO acima.
