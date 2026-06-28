# Spec: Inbound WhatsApp via Meta Cloud API (`cloud-api-inbound`)

**PRD:** [PRD.md](./PRD.md)
**Data:** 2026-06-26
**Status:** Em implementacao
**Escopo:** Edge Function de recebimento + modelo de dados. Outbound, UI e migracao fora de escopo.

> **PVOs aprovados com ajustes (2026-06-26):**
> - PVO 1: tabela `cloud_api_numbers` com `phone_number_id UNIQUE`, `waba_id` incluido, indice em `phone_number_id`.
> - PVO 3: estender CHECK de `delivery_status` para 5 estados AGORA, mas a **logica de `statuses[]` fica em bloco isolado e e a ultima parte validada** (nao-bloqueante para o lancamento).
> - PVO 4: `'cloud_api'` adicionado ao CHECK de forma **aditiva** (sem remover `'meta'`/`'wuzapi'`/`'revolution'`). Verificacao de codigo: `'meta'` so aparece na constraint 046, nenhum codigo le/escreve. Pendente confirmacao no banco (query em §0) antes de qualquer limpeza de valores mortos.
> - PVO 5 + ressalva midia: o `cloud-api-inbound` BAIXA a midia (media_id expira, exige token) e PERSISTE no Storage, passando a URL publica ao handler. Nunca guardar so o `media_id`.

---

## Indice

0. [Pre-requisito: confirmar valor `'meta'` no banco](#0-pre-requisito)
1. [Migration SQL](#1-migration-sql)
2. [Tipos TypeScript](#2-tipos-typescript)
3. [Contrato do webhook Meta Cloud API](#3-contrato-do-webhook)
4. [Shared: assinatura HMAC](#4-shared-assinatura-hmac)
5. [Shared: resolucao de tenant](#5-shared-resolucao-de-tenant)
6. [Shared: download e persistencia de midia](#6-shared-midia)
7. [Shared: processamento de status (isolado)](#7-shared-status)
8. [Edge Function: cloud-api-inbound](#8-edge-function)
9. [config.toml](#9-configtoml)
10. [Secrets](#10-secrets)
11. [Plano de fases e criterios de aceite](#11-plano-de-fases)
12. [Plano de testes](#12-plano-de-testes)

---

## 0. Pre-requisito

Antes de aplicar a migration, rodar no SQL Editor do Dashboard (nao via CLI):

```sql
SELECT active_whatsapp_provider, count(*)
FROM public.companies
GROUP BY active_whatsapp_provider;
```

- Se **nenhuma** linha com `'meta'`/`'wuzapi'`/`'revolution'`: a migration aditiva e segura e podemos planejar limpeza dos valores mortos depois.
- Se **houver** linha com `'meta'`: decidir migrar `'meta' -> 'cloud_api'` antes de prosseguir (nao deixar valor ambiguo). A migration abaixo **nao remove** `'meta'`, entao e segura em ambos os casos — mas a decisao de limpeza fica registrada.

---

## 1. Migration SQL

**Arquivo:** `supabase/migrations/068_cloud_api_integration.sql`

```sql
-- =============================================================
-- Migration 068: Meta Cloud API (WhatsApp oficial) - Inbound
-- Mapeamento phone_number_id -> empresa, provider 'cloud_api',
-- delivery_status estendido para delivered/read.
-- =============================================================

-- 1. Mapeamento de numeros Cloud API -> empresa (roteamento de webhook)
CREATE TABLE IF NOT EXISTS veltzy.cloud_api_numbers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number_id    TEXT NOT NULL UNIQUE,          -- value.metadata.phone_number_id (chave de roteamento)
  waba_id            TEXT,                            -- WhatsApp Business Account id (templates, assinatura)
  display_number     TEXT,                            -- ex: +55 11 99999-0000 (humano)
  instance_label     TEXT,                            -- gravado em leads/messages.instance_name
  access_token       TEXT,                            -- token do numero p/ baixar midia e (futuro) outbound
  status             TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'offboarded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE veltzy.cloud_api_numbers IS
  'Numeros WhatsApp oficiais (Meta Cloud API) por empresa. phone_number_id e a chave de roteamento do webhook.';
COMMENT ON COLUMN veltzy.cloud_api_numbers.phone_number_id IS
  'value.metadata.phone_number_id do payload Meta. UNIQUE: um numero pertence a um unico tenant.';
COMMENT ON COLUMN veltzy.cloud_api_numbers.waba_id IS
  'WhatsApp Business Account id. Necessario para gerenciar templates e identificar a conta na assinatura.';
COMMENT ON COLUMN veltzy.cloud_api_numbers.instance_label IS
  'Valor gravado em leads.whatsapp_instance_name e messages.instance_name (reusa roteamento multi-instancia).';

-- phone_number_id ja e UNIQUE (cria indice unico implicito), mas indice explicito
-- documenta a intencao de lookup O(1) em todo webhook:
CREATE INDEX IF NOT EXISTS idx_cloud_api_numbers_phone_number_id
  ON veltzy.cloud_api_numbers (phone_number_id);
CREATE INDEX IF NOT EXISTS idx_cloud_api_numbers_company
  ON veltzy.cloud_api_numbers (company_id);

ALTER TABLE veltzy.cloud_api_numbers ENABLE ROW LEVEL SECURITY;

-- Leitura: empresa propria ou super_admin. Escrita: admin/manager da empresa ou super_admin.
-- (Edge Function usa service role e ignora RLS.)
CREATE POLICY "cloud_api_numbers_select" ON veltzy.cloud_api_numbers
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "cloud_api_numbers_write" ON veltzy.cloud_api_numbers
  FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager())
    OR veltzy.is_super_admin()
  );

-- 2. Provider 'cloud_api' aceito (ADITIVO: nao remove valores existentes)
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_active_whatsapp_provider_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_active_whatsapp_provider_check
  CHECK (active_whatsapp_provider = ANY (
    ARRAY['zapi','wuzapi','revolution','meta','evolution','cloud_api']
  ));

-- 3. delivery_status estendido para delivered/read (Cloud API entrega statuses[])
-- A migration 045 criou o CHECK inline (ADD COLUMN ... CHECK), nome auto-gerado.
-- Dropamos por introspecao (name-agnostic) em vez de depender do nome exato.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'veltzy.messages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%delivery_status%'
  LOOP
    EXECUTE format('ALTER TABLE veltzy.messages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE veltzy.messages
  ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('pending','sent','delivered','read','failed'));

COMMENT ON COLUMN veltzy.messages.delivery_status IS
  'pending=na fila, sent=enviada ao provider, delivered=entregue ao device, read=lida, failed=erro. Progressao monotonica.';
```

**Notas:**
- O bloco `DO` torna o drop **name-agnostic**: dropa qualquer CHECK que referencie `delivery_status`, independente do nome gerado pela 045. Elimina o risco de o `ADD` falhar por duplicidade sem precisar inspecionar o banco com `\d`.
- Migration segura sem downtime: tabela nova + CHECKs aditivos. Nenhum dado existente viola os novos CHECKs (confirmado em §0: so 'evolution' e 'zapi' em uso).

---

## 2. Tipos TypeScript

**Arquivo:** `src/types/database.ts`

```typescript
// Estender union existente (hoje: 'sent' | 'failed' | 'pending')
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

// Estender provider (hoje: 'zapi' | 'evolution')
export type WhatsAppProviderType = 'zapi' | 'evolution' | 'cloud_api'

/** Mapa phone_number_id -> empresa (veltzy.cloud_api_numbers) */
export interface CloudApiNumber {
  id: string
  company_id: string
  phone_number_id: string
  waba_id: string | null
  display_number: string | null
  instance_label: string | null
  access_token: string | null
  status: 'active' | 'offboarded'
  created_at: string
  updated_at: string
}
```

> Nota: o `Message.delivery_status` no front passa a poder ser `'delivered'`/`'read'`. Componentes que so tratam `'failed'` continuam corretos (ignoram os demais). UI de read/delivered fica para iteracao futura.

---

## 3. Contrato do webhook

### 3.1 GET (verificacao do endpoint)

```
GET /functions/v1/cloud-api-inbound
  ?hub.mode=subscribe
  &hub.verify_token=<META_VERIFY_TOKEN>
  &hub.challenge=<numero>
```
Resposta esperada pela Meta: `200` com o valor cru de `hub.challenge` em `text/plain`.

### 3.2 POST (eventos) — forma do payload

```jsonc
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<waba_id>",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "display_phone_number": "...", "phone_number_id": "<PNID>" },
            "contacts": [ { "profile": { "name": "Fulano" }, "wa_id": "5511..." } ],
            "messages": [
              {
                "from": "5511999990000",
                "id": "wamid.HBg...",          // external_id
                "timestamp": "1719360000",
                "type": "text",                 // text|image|audio|video|document|sticker|location|contacts|interactive|button|reaction
                "text": { "body": "ola" },
                "image": { "id": "<media_id>", "mime_type": "image/jpeg", "caption": "..." },
                "referral": { "source_url": "...", "ctwa_clid": "...", "headline": "..." }
              }
            ],
            "statuses": [
              {
                "id": "wamid.HBg...",           // wamid da MENSAGEM QUE ENVIAMOS
                "status": "delivered",           // sent|delivered|read|failed
                "timestamp": "1719360005",
                "recipient_id": "5511999990000",
                "errors": [ { "code": 131026, "title": "Message undeliverable" } ]
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Eventos de coexistencia chegam com `value` contendo o campo do evento (ex: `value.event === 'account_offboarded'` / `'account_reconnected'`, ou em `changes[].field` correspondente — tratar ambos defensivamente, ver §8.4).

### 3.3 Mapeamento mensagem -> `InboundParams` (assinatura ATUAL do handler)

> A assinatura real de `handleInboundMessage` (em `_shared/lead-inbound-handler.ts`) e mais rica que a documentada no Spec do Evolution. Campos relevantes: `source: 'whatsapp'|'instagram'|'webhook'`, `fileName`, `profilePicUrl`, `instanceName`, `adContext`. Reusar como o `evolution-inbound` faz.

| Cloud API | InboundParams |
|-----------|---------------|
| `messages[].from` -> `normalizePhoneBR(...)` | `phone` |
| `contacts[].profile.name` | `senderName` |
| `messages[].id` (wamid) | `externalId` |
| `messages[].type` (normalizado, ver §3.4) | `messageType` |
| `messages[].text.body` / `<media>.caption` / etc | `content` |
| midia persistida (§6) -> URL publica Storage | `fileUrl` |
| `<media>.mime_type` | `fileMimeType` |
| `document[].filename` | `fileName` |
| `cloud_api_numbers.instance_label ?? phone_number_id` | `instanceName` |
| `messages[].referral` -> `{ source_url, ctwa_clid, ... }` | `adContext` |
| fixo | `source: 'whatsapp'` |

### 3.4 Normalizacao de tipos

Mesma filosofia do `evolution-inbound` (mapear o que o CHECK do banco nao aceita para `text`):
- `text` -> `text` (`text.body`)
- `image|audio|video|document|sticker` -> idem, com midia (§6). `document` carrega `filename`.
- `location` -> `location`, `content = "{lat},{lng}"` (de `messages[].location`).
- `contacts` -> `contact`, `content = nome + telefone`.
- `reaction` -> `text`, `content = reaction.emoji`.
- `interactive` (button_reply/list_reply) -> `text`, `content = title/id selecionado`.
- `button` (template quick-reply) -> `text`, `content = button.text`.
- tipo desconhecido -> `text` + warn (igual evolution-inbound).

---

## 4. Shared: assinatura HMAC

**Arquivo:** `supabase/functions/_shared/meta-signature.ts`

```typescript
/**
 * Valida x-hub-signature-256 da Meta: HMAC-SHA256(rawBody, appSecret) em hex,
 * prefixado por "sha256=". Comparacao em tempo constante.
 * Retorna true se valido. NUNCA logar o appSecret nem a assinatura recebida.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const received = signatureHeader.slice('sha256='.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('')

  return timingSafeEqual(received, expected)
}

/** Comparacao de strings hex em tempo constante (evita timing attack). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
```

> **Critico:** o body precisa ser lido cru via `await req.text()` ANTES de qualquer `JSON.parse`. Ler `req.json()` primeiro consome o stream e impede recalcular o HMAC sobre os bytes originais.

---

## 5. Shared: resolucao de tenant

**Arquivo:** `supabase/functions/_shared/cloud-api-resolve.ts`

```typescript
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ResolvedNumber {
  companyId: string
  instanceLabel: string      // instance_label ?? phone_number_id
  accessToken: string | null // para baixar midia / outbound futuro
  status: 'active' | 'offboarded'
}

/**
 * Resolve a empresa a partir do phone_number_id do payload Meta.
 * Retorna null se o numero nao esta cadastrado (mensagem sera ignorada com 200).
 */
export async function resolveCloudApiNumber(
  supabaseVeltzy: SupabaseClient,   // client com { db: { schema: 'veltzy' } }
  phoneNumberId: string,
): Promise<ResolvedNumber | null> {
  const { data } = await supabaseVeltzy
    .from('cloud_api_numbers')
    .select('company_id, instance_label, phone_number_id, access_token, status')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()

  if (!data) return null

  return {
    companyId: data.company_id,
    instanceLabel: data.instance_label ?? data.phone_number_id,
    accessToken: data.access_token,
    status: data.status,
  }
}
```

---

## 6. Shared: midia

**Arquivo:** `supabase/functions/_shared/cloud-api-media.ts`

A Cloud API entrega `media_id`, nao URL. Fluxo: `GET graph/{media_id}` (com token) -> retorna `url` temporaria -> `GET url` (com token) -> bytes. Como o `media_id`/URL expira rapido e exige token, baixamos e **persistimos no Storage** aqui, passando a URL publica ao handler (que detecta `/storage/v1/object/public/chat-attachments/` e nao re-baixa).

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * Baixa midia da Cloud API e persiste no bucket chat-attachments.
 * Retorna { fileUrl (Storage publica), mimeType } ou null em falha.
 * Best-effort: nunca lanca (midia perdida nao deve derrubar a mensagem).
 */
export async function downloadAndPersistCloudApiMedia(
  supabaseUrl: string,
  supabaseKey: string,
  companyId: string,
  mediaId: string,
  token: string,
  fallbackMime: string | null,
): Promise<{ fileUrl: string; mimeType: string } | null> {
  try {
    // 1. Resolver URL temporaria
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!metaRes.ok) {
      console.error(`[cloud-api-media] meta lookup failed (${metaRes.status}) for ${mediaId}`)
      return null
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string }
    if (!meta.url) return null

    // 2. Baixar bytes (URL exige o mesmo token no header)
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
    if (!binRes.ok) {
      console.error(`[cloud-api-media] download failed (${binRes.status}) for ${mediaId}`)
      return null
    }
    const buffer = await binRes.arrayBuffer()
    if (buffer.byteLength === 0) return null

    const mime = meta.mime_type ?? fallbackMime ?? binRes.headers.get('content-type') ?? 'application/octet-stream'
    const ext = extensionFromMime(mime)
    const path = `${companyId}/cloud-api/${mediaId}.${ext}`

    // 3. Upload para Storage
    const storage = createClient(supabaseUrl, supabaseKey)
    const { error } = await storage.storage
      .from('chat-attachments')
      .upload(path, buffer, { contentType: mime, upsert: true })
    if (error) {
      console.error('[cloud-api-media] upload error:', JSON.stringify(error))
      return null
    }

    const { data } = storage.storage.from('chat-attachments').getPublicUrl(path)
    return { fileUrl: data.publicUrl, mimeType: mime }
  } catch (err) {
    console.error('[cloud-api-media] failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/amr': 'amr',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
  }
  const base = mime.split(';')[0].trim()
  return map[base] ?? base.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? 'bin'
}
```

> **Token:** usar `ResolvedNumber.accessToken` (token do numero, de `cloud_api_numbers`). Fallback para `Deno.env.get('META_SYSTEM_USER_TOKEN')` (system user sem expiracao) se a coluna estiver vazia.

---

## 7. Shared: status (isolado)

**Arquivo:** `supabase/functions/_shared/cloud-api-status.ts`

> **PVO 3 / ajuste:** este bloco e a **ultima parte validada** e e **nao-bloqueante** para o lancamento. O recebimento basico (mensagens) destrava a coexistencia; status e melhoria incremental. Mantido em modulo separado para ser ligado/testado por ultimo sem tocar no caminho de mensagens.

```typescript
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Ordem de progressao: nunca regredir (read nao volta para delivered).
const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 }

interface MetaStatus {
  id: string                 // wamid da mensagem que ENVIAMOS
  status: 'sent' | 'delivered' | 'read' | 'failed'
  errors?: Array<{ code?: number; title?: string }>
}

/**
 * Atualiza messages.delivery_status a partir de statuses[] da Cloud API.
 * Match por (company_id, external_id == status.id). Sem match -> ignora.
 * Best-effort: nunca lanca.
 */
export async function processCloudApiStatuses(
  supabaseVeltzy: SupabaseClient,
  companyId: string,
  statuses: MetaStatus[],
): Promise<void> {
  for (const st of statuses) {
    try {
      const { data: msg } = await supabaseVeltzy
        .from('messages')
        .select('id, delivery_status')
        .eq('company_id', companyId)
        .eq('external_id', st.id)
        .maybeSingle()
      if (!msg) continue // mensagem de outro provider ou sem wamid gravado

      if (st.status === 'failed') {
        if (msg.delivery_status !== 'failed') {
          await supabaseVeltzy.from('messages').update({ delivery_status: 'failed' }).eq('id', msg.id)
        }
        console.warn(`[cloud-api-status] failed wamid=${st.id} errors=${JSON.stringify(st.errors ?? [])}`)
        continue
      }

      // Progressao monotonica: so avanca
      const current = RANK[msg.delivery_status] ?? -1
      const next = RANK[st.status] ?? -1
      if (next > current) {
        await supabaseVeltzy.from('messages').update({ delivery_status: st.status }).eq('id', msg.id)
      }
    } catch (err) {
      console.error('[cloud-api-status] item failed:', err instanceof Error ? err.message : String(err))
      // best-effort: segue para o proximo status
    }
  }
}
```

> **Dependencia para match funcionar (PVO 2):** o outbound precisa gravar `messages.external_id = wamid` retornado pela Cloud API. Enquanto o outbound nao existir, `statuses[]` simplesmente nao acha match e e ignorado — comportamento correto e nao-bloqueante.

---

## 8. Edge Function

**Arquivo:** `supabase/functions/cloud-api-inbound/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { verifyMetaSignature } from '../_shared/meta-signature.ts'
import { resolveCloudApiNumber } from '../_shared/cloud-api-resolve.ts'
import { downloadAndPersistCloudApiMedia } from '../_shared/cloud-api-media.ts'
import { processCloudApiStatuses } from '../_shared/cloud-api-status.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // --- GET: verificacao do endpoint (hub.challenge) ---
  if (req.method === 'GET') {
    const u = new URL(req.url)
    const mode = u.searchParams.get('hub.mode')
    const token = u.searchParams.get('hub.verify_token')
    const challenge = u.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token && token === Deno.env.get('META_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // --- POST: validar assinatura sobre o body CRU ---
  const rawBody = await req.text()
  const appSecret = Deno.env.get('META_APP_SECRET')!
  const valid = await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)
  if (!valid) {
    console.error('[cloud-api-inbound] invalid signature')
    return json({ error: 'Unauthorized' }, 401)
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseVeltzy = createClient(url, key, { db: { schema: 'veltzy' } })

  // --- Loop sobre entry[].changes[].value (PVO 7) ---
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value) continue

        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Resolver tenant
        const resolved = await resolveCloudApiNumber(supabaseVeltzy, phoneNumberId)
        if (!resolved) {
          console.warn(`[cloud-api-inbound] phone_number_id nao mapeado: ${phoneNumberId}`)
          continue // 200 no fim; admin precisa cadastrar o numero
        }

        // Guard de provider (depois de resolver, pois nao vem company_id no payload)
        const { data: company } = await createClient(url, key)
          .from('companies').select('active_whatsapp_provider').eq('id', resolved.companyId).single()
        if (company?.active_whatsapp_provider !== 'cloud_api') {
          console.warn(`[cloud-api-inbound] company ${resolved.companyId} nao usa cloud_api`)
          continue
        }

        // Eventos de coexistencia
        if (await handleCoexistenceEvent(supabaseVeltzy, value, phoneNumberId)) continue

        // Mensagens
        if (Array.isArray(value.messages)) {
          for (const m of value.messages) {
            await processMessage(url, key, resolved, value, m)
          }
        }

        // Status (bloco isolado, nao-bloqueante) — ENVOLVER em try proprio
        if (Array.isArray(value.statuses)) {
          try {
            await processCloudApiStatuses(supabaseVeltzy, resolved.companyId, value.statuses)
          } catch (err) {
            console.error('[cloud-api-inbound] status block error:', err)
          }
        }
      }
    }
  } catch (err) {
    // Erro inesperado: logar mas ainda responder 200 para a Meta nao reenfileirar
    console.error('[cloud-api-inbound] unexpected error:', err)
  }

  return json({ ok: true })
})
```

### 8.1 `processMessage`

```typescript
async function processMessage(
  url: string, key: string,
  resolved: { companyId: string; instanceLabel: string; accessToken: string | null },
  value: any, m: any,
): Promise<void> {
  try {
    const phone = normalizePhoneBR(m.from)
    const senderName = value?.contacts?.[0]?.profile?.name ?? null

    // Normalizar tipo + content + midia
    let messageType = m.type as string
    let content = ''
    let fileUrl: string | null = null
    let fileName: string | null = null
    let fileMimeType: string | null = null

    const token = resolved.accessToken ?? Deno.env.get('META_SYSTEM_USER_TOKEN') ?? ''

    switch (m.type) {
      case 'text': content = m.text?.body ?? ''; break
      case 'image': case 'audio': case 'video': case 'document': case 'sticker': {
        const media = m[m.type]
        content = media?.caption ?? ''
        fileName = media?.filename ?? null
        fileMimeType = media?.mime_type ?? null
        if (media?.id && token) {
          const persisted = await downloadAndPersistCloudApiMedia(
            url, key, resolved.companyId, media.id, token, fileMimeType,
          )
          if (persisted) { fileUrl = persisted.fileUrl; fileMimeType = persisted.mimeType }
        }
        break
      }
      case 'location':
        content = `${m.location?.latitude},${m.location?.longitude}`
        break
      case 'contacts': {
        const c = m.contacts?.[0]
        content = `${c?.name?.formatted_name ?? ''}\n${c?.phones?.[0]?.phone ?? ''}`.trim()
        messageType = 'contact'
        break
      }
      case 'reaction': messageType = 'text'; content = m.reaction?.emoji ?? ''; break
      case 'interactive':
        messageType = 'text'
        content = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ''
        break
      case 'button': messageType = 'text'; content = m.button?.text ?? ''; break
      default: messageType = 'text'; content = ''
    }

    const validTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact']
    if (!validTypes.includes(messageType)) messageType = 'text'

    const adContext = m.referral
      ? { source_url: m.referral.source_url, ctwa_clid: m.referral.ctwa_clid,
          ad_title: m.referral.headline, ad_id: m.referral.source_id }
      : null

    await handleInboundMessage({
      supabaseUrl: url,
      supabaseKey: key,
      companyId: resolved.companyId,
      phone,
      senderName,
      content,
      messageType,
      externalId: m.id ?? null,
      fileUrl,
      fileName,
      fileMimeType,
      source: 'whatsapp',
      instanceName: resolved.instanceLabel,
      adContext,
      profilePicUrl: null,
    })
  } catch (err) {
    // best-effort por mensagem: nao derruba as demais nem a resposta 200
    console.error('[cloud-api-inbound] processMessage error:', err)
  }
}
```

### 8.2 Dedup

O proprio `handleInboundMessage` ja faz dedup por `(company_id, external_id)` — o `wamid` e estavel, entao reentregas da Meta nao duplicam mensagem. Nada extra aqui.

### 8.3 Guard reusa client public

O guard busca `companies` no schema `public` (nao `veltzy`), por isso usa `createClient(url, key)` sem schema override. Pode ser fatorado para fora do loop para evitar recriacao por item (otimizacao menor; manter legivel primeiro).

### 8.4 `handleCoexistenceEvent`

```typescript
async function handleCoexistenceEvent(
  supabaseVeltzy: any, value: any, phoneNumberId: string,
): Promise<boolean> {
  // A Meta pode sinalizar via value.event ou changes[].field; tratar ambos.
  const ev = value?.event ?? value?.account_alert?.event ?? null
  if (ev === 'account_offboarded' || ev === 'account_reconnected') {
    const status = ev === 'account_offboarded' ? 'offboarded' : 'active'
    await supabaseVeltzy.from('cloud_api_numbers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('phone_number_id', phoneNumberId)
    console.log(`[cloud-api-inbound] coexistence ${ev} -> status=${status} (${phoneNumberId})`)
    return true
  }
  return false
}
```

> Nesta versao: apenas atualiza `cloud_api_numbers.status` + log (PVO 6). Notificar admin = iteracao futura.

---

## 9. config.toml

**Arquivo:** `supabase/config.toml`

```toml
[functions.cloud-api-inbound]
verify_jwt = false
```

> `verify_jwt = false` e obrigatorio: a Meta chama o endpoint sem JWT do Supabase. A autenticacao real e a assinatura HMAC (§4) e a verificacao GET (§3.1).

---

## 10. Secrets

| Secret | Uso | Origem |
|--------|-----|--------|
| `META_APP_SECRET` | HMAC de `x-hub-signature-256` | App Veltzy (Developer Portal) |
| `META_VERIFY_TOKEN` | Verificacao GET `hub.verify_token` | String aleatoria gerada por nos |
| `META_SYSTEM_USER_TOKEN` | Fallback p/ baixar midia (token sem expiracao) | System user `Veltzy_WhatsApp_SysUser` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Banco | Ja existem |

Setar via: `npx supabase secrets set META_APP_SECRET=... META_VERIFY_TOKEN=... META_SYSTEM_USER_TOKEN=...`

Webhook URL na Meta: `https://zxefzegggntfjlfsdgvw.supabase.co/functions/v1/cloud-api-inbound`

---

## 11. Plano de fases

### Fase 1: Modelo de dados
| Acao | Arquivo | Tipo |
|------|---------|------|
| Confirmar valor `'meta'` no banco (§0) | — | Manual (Dashboard) |
| Migration 068 | `supabase/migrations/068_cloud_api_integration.sql` | Novo |
| Tipos | `src/types/database.ts` | Editar |
| Seed manual de 1 numero de teste | — | Manual (SQL Editor) |

**Aceite:** migration aplica sem erro; `npm run build` passa; 1 linha em `cloud_api_numbers` mapeando o numero de teste.

### Fase 2: Endpoint (mensagens + GET + HMAC)
| Acao | Arquivo | Tipo |
|------|---------|------|
| Assinatura HMAC | `_shared/meta-signature.ts` | Novo |
| Resolucao de tenant | `_shared/cloud-api-resolve.ts` | Novo |
| Download/persistencia de midia | `_shared/cloud-api-media.ts` | Novo |
| Edge Function (GET + POST mensagens, SEM status ainda) | `cloud-api-inbound/index.ts` | Novo |
| config.toml | `supabase/config.toml` | Editar |
| Secrets | — | Manual |

**Aceite:** GET challenge valida na Meta; mensagem de texto e de midia reais criam lead/deal/mensagem; midia persiste no Storage; dedup por `wamid` funciona; SDR/automacoes disparam.

### Fase 3: Status + coexistencia (ultima parte, nao-bloqueante)
| Acao | Arquivo | Tipo |
|------|---------|------|
| Processamento de status (isolado) | `_shared/cloud-api-status.ts` | Novo |
| Ligar `processCloudApiStatuses` + `handleCoexistenceEvent` no index | `cloud-api-inbound/index.ts` | Editar |

**Aceite:** `statuses[]` de uma mensagem com `external_id=wamid` atualiza `delivery_status` monotonicamente; `account_offboarded`/`reconnected` mudam `cloud_api_numbers.status`. Validado por ultimo; lancamento de recebimento nao depende disso.

---

## 12. Plano de testes

**Unit (Deno):**
- `verifyMetaSignature`: assinatura valida/invalida/ausente; body alterado falha.
- `processCloudApiStatuses`: progressao `sent->delivered->read`; nao regride `read->delivered`; `failed` sobrepoe; sem match = no-op.
- Normalizacao de tipo: cada `m.type` -> `messageType`/`content` esperado.

**Integracao (endpoint local `supabase functions serve`):**
1. `GET ?hub.mode=subscribe&hub.verify_token=<ok>&hub.challenge=123` -> body `123`, 200. Token errado -> 403.
2. POST com assinatura invalida -> 401, nada gravado.
3. POST mensagem de texto (payload real da Meta) -> lead/deal/mensagem; `instance_name` = label; `external_id` = wamid.
4. POST mesma mensagem 2x (mesmo wamid) -> 1 mensagem (dedup).
5. POST imagem -> midia baixada e em `chat-attachments`, `file_url` aponta para Storage.
6. POST `phone_number_id` nao cadastrado -> 200, log de aviso, nada gravado.
7. POST empresa com provider != cloud_api -> 200, skip.
8. (Fase 3) POST `statuses[]` para um wamid existente -> `delivery_status` atualizado; ordem respeitada.
9. (Fase 3) POST `account_offboarded` -> `cloud_api_numbers.status='offboarded'`.

**Producao (numero de teste):**
- Enviar mensagem real do celular ao numero -> aparece no inbox em < 2s.
- Validar transcricao de audio e avatar.
```
