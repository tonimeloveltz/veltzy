# API - Veltzy Edge Functions

## Webhooks Publicos

### WhatsApp (Z-API)
```
POST https://{project}.supabase.co/functions/v1/zapi-webhook
```
Configurar no painel Z-API como URL de webhook.

### Source Webhook (Landing Pages / Ads)
```
POST https://{project}.supabase.co/functions/v1/source-webhook
Authorization: Bearer {webhook_token}
Content-Type: application/json
```

Autenticacao por Bearer token (gerado no painel Admin > Integracoes > Webhooks).
O token identifica empresa, origem e pipeline destino automaticamente.

Payload depende do preset configurado:

**Generico:**
```json
{ "phone": "11999999999", "name": "Joao Silva", "email": "joao@email.com", "tags": ["landing-page"] }
```

**Meta Lead Ads (via middleware):**
```json
{ "full_name": "Joao Silva", "phone_number": "+5511999999999", "email": "joao@email.com" }
```

**Google Lead Form:**
```json
{ "user_column_data": [{ "column_id": "FULL_NAME", "string_value": "Joao" }, { "column_id": "PHONE_NUMBER", "string_value": "+5511999999999" }] }
```

**RD Station:**
```json
{ "leads": [{ "name": "Joao", "personal_phone": "+5511999999999", "email": "joao@email.com" }] }
```

Resposta:
```json
{ "success": true, "leadId": "uuid", "isNewLead": true }
```

### Instagram Webhook
```
POST https://{project}.supabase.co/functions/v1/instagram-webhook
```
Configurar no Meta Developer Dashboard como webhook URL.
Verify token: configurar como secret `INSTAGRAM_VERIFY_TOKEN`.

## Funcoes Autenticadas

Todas requerem header `Authorization: Bearer {access_token}`.

### Enviar Mensagem WhatsApp
```
POST https://{project}.supabase.co/functions/v1/zapi-send
{
  "leadId": "uuid",
  "content": "Mensagem",
  "messageType": "text"
}
```

### Gerenciar WhatsApp
```
POST https://{project}.supabase.co/functions/v1/whatsapp-manager
{ "companyId": "uuid", "action": "status|qrcode|disconnect|restart" }
```

### IA SDR
```
POST https://{project}.supabase.co/functions/v1/sdr-ai
{
  "leadId": "uuid",
  "companyId": "uuid",
  "messageContent": "texto da mensagem",
  "conversationHistory": []
}
```

Resposta:
```json
{
  "score": 72,
  "temperature": "hot",
  "response": "Mensagem da IA",
  "should_respond": true,
  "reasoning": "Explicacao"
}
```
