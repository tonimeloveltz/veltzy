# Spec — Envio (outbound) WhatsApp Cloud API

> Plano de implementação derivado de `docs/features/cloud-api-outbound/PRD.md`.
> Repositórios afetados: `veltzgroup/veltzy-app` (este) e `tonimeloveltz/hub`.
> Banco: Supabase Central `zxefzegggntfjlfsdgvw` (produção).

## Resumo executivo

Adicionar um ramo `cloud_api` ao caminho de envio do Veltzy (`whatsapp-send`) que, espelhando o Evolution, resolve o `phone_number_id` do lead e delega a uma nova Edge Function no Hub (`cloud-api-send-message`) que detém o token e fala com a Graph API; o `wamid` retornado é gravado em `messages.external_id`.

## Pré-condições

- Inbound Cloud API vivo e validado (feito em 26/06): `cloud-api-inbound`, `_shared/cloud-api-resolve.ts`, `_shared/cloud-api-media.ts`, migration `068_cloud_api_integration.sql` aplicada.
- Tabela `veltzy.cloud_api_numbers` existe (criada na 068), com pelo menos um número da Stark Tech cadastrado e `status = 'active'`.
- `companies.active_whatsapp_provider` já aceita `'cloud_api'` (CHECK ampliado na 068).
- Secret `META_SYSTEM_USER_TOKEN` configurado **no projeto do Hub** (já usado pelo inbound para baixar mídia).
- Build/deploy do Veltzy passando antes de começar.

> **Dependência cross-repo (não escorregar):** o ramo do Veltzy só funciona com `cloud-api-send-message` **já deployado no Hub**. Ordem obrigatória: **Hub primeiro, Veltzy depois.** Ligar o ramo no Veltzy antes do deploy do Hub faz o teste falhar por falta da contraparte (404 na chamada m2m).

## Escopo travado (NÃO inchar)

Itens que parecem próximos mas estão **fora** deste ciclo. Se durante a implementação surgir a tentação de incluir qualquer um, **pare e sinalize** em vez de incluir:

- ❌ `process-message-queue` — não ganha o ramo `cloud_api` agora. Só `whatsapp-send`.
- ❌ Templates / envio fora da janela de 24h — só mensagem livre (texto e mídia) dentro da janela.
- ❌ Mistura de providers na mesma empresa — provider continua sendo da empresa (`active_whatsapp_provider`, valor único). Mover provider para o nível do número é o ciclo seguinte.
- ❌ Tela de integração (cadastro de números, escolha de default por UI) — `is_default` é setado por SQL manual neste ciclo.
- ❌ Reconciliação de `cloud_api_numbers` com a tabela de instâncias do Hub.

---

## Arquivos a criar

### `supabase/migrations/069_cloud_api_outbound.sql` (novo)

**Propósito:** adicionar o necessário para resolução multi-número no outbound. Aditiva, não altera dado existente.

**O que implementar:**
- Coluna `cloud_api_number_id` em `veltzy.leads`, nullable, FK para `veltzy.cloud_api_numbers(id)`.
- Coluna `is_default` em `veltzy.cloud_api_numbers`, `NOT NULL DEFAULT false`.
- Índice único parcial garantindo no máximo um default por empresa.
- Comentário de schema em `veltzy.messages.external_id` documentando o duplo uso (inbound dedup + outbound wamid).

**Snippet de referência:**
```sql
-- =============================================================
-- Migration 069: Cloud API Outbound — multi-número
-- Aditiva. Nenhum dado existente é alterado.
-- PRD/Spec: docs/features/cloud-api-outbound/
-- =============================================================

-- 1. Vínculo lead -> número Cloud API (inbound carimba, outbound lê).
--    Nullable: leads de Evolution/Z-API não têm.
ALTER TABLE veltzy.leads
  ADD COLUMN IF NOT EXISTS cloud_api_number_id UUID NULL
    REFERENCES veltzy.cloud_api_numbers(id);

COMMENT ON COLUMN veltzy.leads.cloud_api_number_id IS
  'Número Cloud API pelo qual este lead conversa. Carimbado pelo inbound (cloud-api-inbound), lido pelo outbound (whatsapp-send). NULL para leads de outros providers.';

-- Índice para o lookup do outbound e para o FK (PG não cria automático).
CREATE INDEX IF NOT EXISTS idx_leads_cloud_api_number_id
  ON veltzy.leads (cloud_api_number_id);

-- 2. Default por empresa.
ALTER TABLE veltzy.cloud_api_numbers
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Um único default por empresa (índice parcial).
CREATE UNIQUE INDEX IF NOT EXISTS cloud_api_numbers_one_default_per_company
  ON veltzy.cloud_api_numbers (company_id) WHERE is_default;

-- 3. Documentar duplo uso de external_id.
COMMENT ON COLUMN veltzy.messages.external_id IS
  'ID do provider para esta mensagem. Inbound: wamid recebido (dedup). Outbound: wamid retornado pela Meta no envio (correlação para status, Fase 3). wamid é único global, os dois usos nunca colidem.';
```

---

### `supabase/functions/_shared/providers/cloud-api.ts` (novo)

**Propósito:** provider Cloud API. Recebe o `phoneNumberId` já resolvido via payload (espelhando como o Evolution recebe `instanceName`), chama `cloud-api-send-message` no Hub pelo padrão m2m, lê `{ wamid }` e retorna `{ externalId: wamid }`. Em erro, monta a string de `delivery_error` a partir da estrutura de erro da Graph API propagada pelo Hub e lança — `whatsapp-send` captura e grava `delivery_status='failed'`.

**O que implementar:**
- Classe `CloudApiHubProvider implements WhatsAppProvider`.
- Construtor lê `HUB_SUPABASE_URL`/`HUB_SERVICE_ROLE_KEY` com fallback para `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (idêntico ao `EvolutionHubProvider`).
- `sendMessage` retorna `Promise<SendMessageResult>` (`{ externalId }`).
- Em erro do Hub, parsear `error.{code,message,details,fbtrace_id}` e lançar `Error` com a string combinada.
- Métodos restantes da interface (`getStatus`, `getQrCode`, `disconnect`, `restart`, `getProfilePicture`, `getChats`): stubs como no `EvolutionHubProvider` (gerenciamento é no Hub).

**Snippet de referência:**
```ts
import type {
  WhatsAppProvider, WhatsAppConfig, SendMessagePayload, SendMessageResult,
  StatusResult, QrCodeResult, ChatEntry,
} from '../whatsapp-provider.ts'

/**
 * Provider WhatsApp Cloud API (oficial Meta) que envia via Edge Function do Hub.
 * Veltzy nunca tem o token nem chama a Graph API direto (regra cardinal).
 */
export class CloudApiHubProvider implements WhatsAppProvider {
  private hubUrl: string
  private hubServiceKey: string

  constructor() {
    this.hubUrl = Deno.env.get('HUB_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
    this.hubServiceKey = Deno.env.get('HUB_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  }

  async sendMessage(
    _config: WhatsAppConfig,
    payload: SendMessagePayload & { phoneNumberId?: string; companyId?: string },
  ): Promise<SendMessageResult> {
    const phoneNumberId = payload.phoneNumberId
    if (!phoneNumberId) {
      throw new Error('phone_number_id obrigatorio para Cloud API provider')
    }

    const isMedia = payload.type !== 'text' && payload.mediaUrl
    const body = {
      phone_number_id: phoneNumberId,
      company_id: payload.companyId ?? _config.company_id,
      to: payload.phone,
      message: isMedia
        ? { media: { type: payload.type, url: payload.mediaUrl, caption: payload.content } }
        : { text: payload.content },
    }

    const res = await fetch(`${this.hubUrl}/functions/v1/cloud-api-send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.hubServiceKey,
        'Authorization': `Bearer ${this.hubServiceKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Hub propaga error.{code,type,message,details,fbtrace_id}. Montar string
      // combinada para messages.delivery_error (code = tratamento futuro, fbtrace = suporte Meta).
      const e = (data?.error ?? {}) as Record<string, unknown>
      const parts = [
        e.code != null ? `[${e.code}]` : null,
        e.message ?? null,
        e.details ?? null,
        e.fbtrace_id ? `fbtrace=${e.fbtrace_id}` : null,
      ].filter(Boolean)
      throw new Error(parts.join(' | ') || `Cloud API send failed (${res.status})`)
    }

    return { externalId: (data as { wamid?: string }).wamid }
  }

  async getStatus(_config: WhatsAppConfig): Promise<StatusResult> { return { connected: true } }
  async getQrCode(_config: WhatsAppConfig): Promise<QrCodeResult> {
    throw new Error('Cloud API gerenciada no Hub / Embedded Signup.')
  }
  async disconnect(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de numeros feito no Hub.')
  }
  async restart(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de numeros feito no Hub.')
  }
  async getProfilePicture(_config: WhatsAppConfig, _phone: string): Promise<string | null> { return null }
  async getChats(_config: WhatsAppConfig): Promise<ChatEntry[]> { return [] }
}
```

---

### Hub: `supabase/functions/cloud-api-send-message/index.ts` (novo — repo `tonimeloveltz/hub`)

**Propósito:** detém o token e fala com a Graph API. Recebe `{ phone_number_id, company_id, to, message }`, resolve o token (atual: `META_SYSTEM_USER_TOKEN`), faz `POST graph.facebook.com/v25.0/{phone_number_id}/messages`, no 200 extrai `messages[0].id` e devolve `{ wamid }`, no erro devolve `{ error: {...} }`. Auth service role m2m, igual `evolution-send-message`.

**O que implementar:**
- Auth m2m: aceitar quando `Authorization: Bearer <service_role>` bate com o service role key do Hub (mesmo padrão de `evolution-send-message` — reusar o guard existente lá).
- Resolver token: `META_SYSTEM_USER_TOKEN` do Secret. (Futuro: `oauth_integrations` por `phone_number_id` — **não implementar agora**.)
- Montar body Graph para texto e mídia.
- Sucesso (200): `{ wamid: data.messages[0].id }`.
- Erro: status não-2xx com `{ error: { code, type, message, details, fbtrace_id } }`.

**Snippet de referência:**
```ts
// Headers CORS + auth m2m idênticos ao evolution-send-message do Hub.
const GRAPH_VERSION = 'v25.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // 1. Auth m2m (Bearer == service role key do Hub) — reusar guard do evolution-send-message.

  const { phone_number_id, company_id, to, message } = await req.json()
  if (!phone_number_id || !to || !message) {
    return json({ error: { message: 'phone_number_id, to e message obrigatorios' } }, 400)
  }

  const token = Deno.env.get('META_SYSTEM_USER_TOKEN')
  if (!token) return json({ error: { message: 'META_SYSTEM_USER_TOKEN ausente' } }, 500)

  // 2. Montar body Graph (texto ou mídia).
  let graphBody: Record<string, unknown>
  if (message.text != null) {
    graphBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message.text },
    }
  } else if (message.media) {
    const { type, url, caption } = message.media
    graphBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type, // 'image' | 'audio' | 'video' | 'document'
      [type]: { link: url, ...(caption ? { caption } : {}) },
    }
  } else {
    return json({ error: { message: 'message.text ou message.media obrigatorio' } }, 400)
  }

  // 3. POST Graph API.
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phone_number_id}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(graphBody),
    },
  )
  const data = await res.json().catch(() => ({}))

  if (!res.ok || data?.error) {
    const e = data?.error ?? {}
    return json({
      error: {
        code: e.code ?? null,
        type: e.type ?? null,
        message: e.message ?? `Graph API ${res.status}`,
        details: e.error_data?.details ?? null,
        fbtrace_id: e.fbtrace_id ?? null,
      },
    }, 502)
  }

  // 200 = aceito pela API (não entregue). Veltzy grava delivery_status='sent'.
  return json({ wamid: data?.messages?.[0]?.id ?? null })
})
```

---

## Arquivos a modificar

### `supabase/functions/_shared/whatsapp-provider.ts`

**O que mudar:**
1. `WhatsAppProviderType`: adicionar `'cloud_api'`.
2. Novo tipo de retorno `SendMessageResult` e mudar a assinatura de `sendMessage`.

**Linhas aproximadas:** linha 3 (type) e linhas 16-42 (interfaces).

```ts
export type WhatsAppProviderType = 'zapi' | 'evolution' | 'cloud_api'

// ... abaixo de SendMessagePayload:
export interface SendMessageResult {
  /** id do provider para a mensagem enviada (wamid no Cloud API). undefined nos providers que não retornam. */
  externalId?: string
}

// na interface WhatsAppProvider:
sendMessage(config: WhatsAppConfig, payload: SendMessagePayload): Promise<SendMessageResult>
```

> ⚠️ **Costura compartilhada — ponto de maior atenção.** Esta é a única mudança que toca os três providers. É uma ampliação de retorno (`void` → `{ externalId? }`), segura porque nenhum chamador atual usa o retorno. Exige o teste de regressão Evolution antes de fechar (ver Plano de teste).

### `supabase/functions/_shared/providers/zapi.ts`

**O que mudar:** assinatura de `sendMessage` para `Promise<SendMessageResult>` e adicionar `return {}` no fim do método (não retorna `externalId`).

**Linhas aproximadas:** linha 19 (assinatura) e linha 54-55 (fim do método, após o bloco de erro).

```ts
async sendMessage(config: WhatsAppConfig, payload: SendMessagePayload): Promise<SendMessageResult> {
  // ... corpo idêntico ...
  if (!res.ok || data.error) {
    throw new Error(`Z-API error: ${data.error ?? res.status}`)
  }
  return {}
}
```
Importar `SendMessageResult` do `../whatsapp-provider.ts`.

### `supabase/functions/_shared/providers/evolution-hub.ts`

**O que mudar:** assinatura de `sendMessage` para `Promise<SendMessageResult>` e `return {}` no fim (após o `await this.callHub(...)`).

**Linhas aproximadas:** linhas 42-61.

```ts
async sendMessage(
  _config: WhatsAppConfig,
  payload: SendMessagePayload & { instanceName?: string; companyId?: string },
): Promise<SendMessageResult> {
  // ... corpo idêntico ...
  await this.callHub('evolution-send-message', { /* ... */ })
  return {}
}
```
Importar `SendMessageResult`.

### `supabase/functions/_shared/whatsapp-config.ts`

**O que mudar:** `getActiveProvider` reconhecer `'cloud_api'` no tipo de retorno e na validação (remover o fallback que força valor desconhecido para `zapi` **apenas** para `cloud_api`; valores realmente inválidos continuam caindo em `zapi`).

**Linhas aproximadas:** linhas 7-23.

```ts
export async function getActiveProvider(
  supabase: SupabaseClient,
  companyId: string,
): Promise<'zapi' | 'evolution' | 'cloud_api'> {
  const { data } = await supabase
    .from('companies')
    .select('active_whatsapp_provider')
    .eq('id', companyId)
    .single()

  const provider = (data?.active_whatsapp_provider as string) ?? 'zapi'
  if (provider !== 'zapi' && provider !== 'evolution' && provider !== 'cloud_api') {
    console.warn(`[getActiveProvider] Valor inesperado: '${provider}' (company_id=${companyId}). Fallback para 'zapi'.`)
    return 'zapi'
  }
  return provider
}
```

### `supabase/functions/_shared/whatsapp-factory.ts`

**O que mudar:** importar e registrar `cloud_api`.

**Linhas aproximadas:** linhas 1-8.

```ts
import { CloudApiHubProvider } from './providers/cloud-api.ts'

const providers: Record<string, WhatsAppProvider> = {
  zapi: new ZApiProvider(),
  evolution: new EvolutionHubProvider(),
  cloud_api: new CloudApiHubProvider(),
}
```

### `supabase/functions/_shared/cloud-api-resolve.ts`

**O que mudar:**
1. `ResolvedNumber`: adicionar `id: string` (PK da row, para o inbound carimbar o vínculo). Adicionar `'id'` ao `.select(...)` e mapear `id: data.id`.
2. Adicionar nova função `resolveOutboundCloudApiNumber` (lógica de resolução do outbound: vínculo do lead → default da empresa).

**Linhas aproximadas:** interface no topo (linhas 12-17), select dentro de `resolveCloudApiNumber` (linha ~36), e função nova no fim do arquivo.

```ts
export interface ResolvedNumber {
  id: string                   // PK de cloud_api_numbers (carimbo do vínculo no lead)
  companyId: string
  instanceLabel: string
  accessToken: string | null
  status: 'active' | 'offboarded'
}

// dentro de resolveCloudApiNumber: incluir 'id' no select e no retorno:
//   .select('id, company_id, instance_label, phone_number_id, access_token, status')
//   return { id: data.id, companyId: data.company_id, ... }

// --- Resolução de número para outbound ---
export interface OutboundNumber {
  phoneNumberId: string
  instanceLabel: string        // vai para messages.instance_name (auditoria multi-instância)
}

/**
 * Resolve qual número Cloud API usar para enviar.
 *  1. lead.cloud_api_number_id (responde pelo número onde o lead falou)
 *  2. número default da empresa (status='active' AND is_default=true)
 *  3. null -> erro de configuração (whatsapp-send não envia)
 */
export async function resolveOutboundCloudApiNumber(
  // deno-lint-ignore no-explicit-any
  supabaseVeltzy: SupabaseClient<any, any, any>,
  lead: { cloud_api_number_id: string | null; company_id: string },
): Promise<OutboundNumber | null> {
  // 1. Vínculo do lead
  if (lead.cloud_api_number_id) {
    const { data } = await supabaseVeltzy
      .from('cloud_api_numbers')
      .select('phone_number_id, instance_label, status')
      .eq('id', lead.cloud_api_number_id)
      .maybeSingle()
    if (data && data.status === 'active') {
      return {
        phoneNumberId: data.phone_number_id,
        instanceLabel: data.instance_label ?? data.phone_number_id,
      }
    }
  }

  // 2. Default da empresa
  const { data: def } = await supabaseVeltzy
    .from('cloud_api_numbers')
    .select('phone_number_id, instance_label')
    .eq('company_id', lead.company_id)
    .eq('status', 'active')
    .eq('is_default', true)
    .maybeSingle()
  if (def) {
    return {
      phoneNumberId: def.phone_number_id,
      instanceLabel: def.instance_label ?? def.phone_number_id,
    }
  }

  // 3. Sem vínculo e sem default
  return null
}
```

### `supabase/functions/whatsapp-send/index.ts`

**O que mudar:**
1. Importar `resolveOutboundCloudApiNumber`.
2. Adicionar `cloud_api_number_id` ao select do lead.
3. Declarar `let externalId: string | null = null` junto dos outros locais de estado.
4. Adicionar o ramo `else if (activeProvider === 'cloud_api')` que resolve o número, chama o provider e captura `externalId` (ou seta `failed`/`deliveryError` no catch).
5. Incluir `external_id: externalId` no insert de `messages`.

**Linhas aproximadas:**
- import: topo (linhas 1-4)
- select do lead: linhas 84-88 → `'phone, whatsapp_instance_name, assigned_to, pipeline_id, company_id, cloud_api_number_id'`
- declarações de estado: linhas 110-113 → adicionar `externalId`
- ramo novo: entre o bloco `evolution` (termina linha 151) e o `else` do Z-API (linha 152). Converter o `else` final do Z-API em `else` mantido; inserir `else if` antes dele.
- insert: linhas 177-193 → adicionar `external_id: externalId`

```ts
// import
import { resolveOutboundCloudApiNumber } from '../_shared/cloud-api-resolve.ts'

// estado (junto de deliveryStatus/deliveryError)
let externalId: string | null = null

// ramo novo — inserir ANTES do "else" do Z-API:
} else if (activeProvider === 'cloud_api') {
  const outbound = await resolveOutboundCloudApiNumber(supabase, {
    cloud_api_number_id: lead.cloud_api_number_id,
    company_id: companyId,
  })

  if (!outbound) {
    return new Response(JSON.stringify({
      error: 'Nenhum numero Cloud API configurado para esta empresa (sem vinculo no lead e sem default).',
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // instance_name = label do número (auditoria multi-instância, igual Evolution)
  instanceName = outbound.instanceLabel

  try {
    const provider = createProvider('cloud_api')
    const result = await provider.sendMessage({} as import('../_shared/whatsapp-provider.ts').WhatsAppConfig, {
      phone: lead.phone,
      content: payload.content,
      type: msgType,
      mediaUrl: payload.fileUrl,
      fileName: payload.fileName,
      phoneNumberId: outbound.phoneNumberId,
      companyId,
    })
    externalId = result.externalId ?? null
  } catch (err) {
    console.error('[whatsapp-send] Cloud API send failed:', err)
    deliveryStatus = 'failed'
    deliveryError = err instanceof Error ? err.message : String(err)
  }
} else {
  // Fluxo Z-API existente (intocado)

// insert: adicionar ao objeto
external_id: externalId,
```

> Nota: nos ramos Evolution e Z-API, `externalId` permanece `null`, então `external_id` gravado é `null` — **idêntico** ao comportamento atual (hoje a coluna nem é informada e default é null). Não há colisão com o índice parcial unique de dedup do inbound: `wamid` é único global.

### `supabase/functions/_shared/lead-inbound-handler.ts`

**O que mudar:**
1. `InboundParams`: adicionar campo opcional `cloudApiNumberId?: string | null` (padrão dos overrides opcionais como `pipelineId`, `sourceId`). Evolution/Z-API passam vazio.
2. Select do lead existente (linha 49): adicionar `cloud_api_number_id`.
3. Carimbar vínculo no lead existente quando vier `cloudApiNumberId` e diferir (espelha o bloco de `whatsapp_instance_name`, linhas 60-64).
4. `createLead`: adicionar `cloud_api_number_id: params.cloudApiNumberId ?? null` ao insert.

**Linhas aproximadas:** interface (linhas 5-33), select (linha 49), update (após linha 64), insert do createLead (linhas 401-416).

```ts
// InboundParams — junto dos overrides opcionais
/** Vínculo do número Cloud API (preenchido só por cloud-api-inbound). */
cloudApiNumberId?: string | null

// select do lead existente (linha ~49)
.select('id, assigned_to, avatar_url, name, whatsapp_instance_name, cloud_api_number_id')

// carimbo no lead existente (após o bloco de whatsapp_instance_name)
if (lead && params.cloudApiNumberId && lead.cloud_api_number_id !== params.cloudApiNumberId) {
  await supabase.from('leads')
    .update({ cloud_api_number_id: params.cloudApiNumberId })
    .eq('id', lead.id)
}

// createLead insert — adicionar campo
cloud_api_number_id: params.cloudApiNumberId ?? null,
```

> O tipo de retorno de `createLead` (assinatura na linha 288 e o `.select(...)` da linha 417) **não** precisa incluir `cloud_api_number_id` — não é lido depois da criação.

### `supabase/functions/cloud-api-inbound/index.ts`

**O que mudar:** passar `cloudApiNumberId: resolved.id` na chamada de `handleInboundMessage`.

**Linhas aproximadas:** objeto passado a `handleInboundMessage` (linhas 202-218).

```ts
const result = await handleInboundMessage({
  // ... campos existentes ...
  instanceName: resolved.instanceLabel,
  cloudApiNumberId: resolved.id,   // carimba leads.cloud_api_number_id
  adContext,
  profilePicUrl: null,
})
```

---

## Arquivos a NÃO tocar

- `supabase/functions/process-message-queue/` — fora de escopo (não recebe o ramo `cloud_api` agora).
- `supabase/functions/evolution-inbound/`, `evolution-send-message` (Hub) — regressão exige que fiquem intocados; só a assinatura de retorno do provider muda, e por ampliação.
- `supabase/functions/_shared/resolve-instance.ts` — resolução do Evolution, não reusada pelo Cloud API (que tem `resolveOutboundCloudApiNumber` própria).
- `supabase/functions/_shared/cloud-api-media.ts` — inbound, sem mudança.
- `src/` (frontend) — `whatsapp-send` continua retornando a row de `messages`; nenhuma mudança de contrato com o front. `external_id` já existe no type (`src/types/database.ts:341`).
- Migration `068_cloud_api_integration.sql` — já aplicada; não editar, a 069 é incremental.
- Coluna `cloud_api_numbers.access_token` — sem uso no outbound deste ciclo (token vive no Hub).

---

## Ordem de implementação

A ordem honra a dependência cross-repo e isola a costura de risco.

1. **Migration 069** (Veltzy) — cria coluna/índice. Aplicar com `npx supabase db push`. Setar `is_default = true` no número da Stark Tech via SQL manual.
2. **Hub: `cloud-api-send-message` + deploy.** Cross-repo primeiro — sem ele o ramo do Veltzy não tem contraparte. Validar com `curl` m2m direto (texto) antes de seguir.
3. **Veltzy — costura de interface:** `whatsapp-provider.ts` (`SendMessageResult` + type), `zapi.ts` (`return {}`), `evolution-hub.ts` (`return {}`), `whatsapp-config.ts` (`getActiveProvider`), `whatsapp-factory.ts`. Build deve passar aqui. **Rodar a regressão Evolution antes de avançar** (a mudança já está completa neste passo).
4. **Veltzy — provider + ramo:** `providers/cloud-api.ts`, `cloud-api-resolve.ts` (`resolveOutboundCloudApiNumber`), `whatsapp-send/index.ts` (ramo + `external_id` no insert).
5. **Inbound — carimbo do vínculo:** `cloud-api-resolve.ts` (`id` no `ResolvedNumber`), `lead-inbound-handler.ts` (campo + carimbo + insert), `cloud-api-inbound/index.ts` (passar `resolved.id`).
6. **Validação:** regressão Evolution → envio manual Cloud API → SDR responde.

> Passos 3 e 5 ambos tocam `cloud-api-resolve.ts` — fazer o passo 5 do arquivo depois do 4 evita conflito; ou consolidar as duas edições do arquivo num só momento.

---

## Plano de teste

### 1. Regressão Evolution (obrigatória — costura compartilhada)

- [ ] Com um cliente Evolution de teste, enviar uma mensagem de texto pelo inbox (sender humano). Confirmar: chega no destino, linha em `messages` com `instance_name` correto, `delivery_status='sent'`, `external_id = null` (idêntico ao comportamento anterior).
- [ ] Enviar uma mídia por Evolution e confirmar entrega idêntica.
- [ ] Nenhuma das 10 empresas Evolution ativas é tocada (código aditivo, ramo `cloud_api` não roda para elas).

### 2. Hub isolado (antes de ligar o Veltzy)

- [ ] `curl` m2m para `cloud-api-send-message` com `{ phone_number_id, company_id, to, message:{text} }` e service role no header → resposta `{ wamid: "wamid.HBgL..." }`, mensagem chega no celular.
- [ ] `curl` com `to` fora da janela de 24h → resposta de erro com `code` e `fbtrace_id` no `error`.

### 3. Cloud API — envio manual (Veltzy)

- [ ] Janela da conversa "Toni Melo" na Stark Tech aberta (reabrir com `hello_world` se passou de 24h). Mandar texto pelo inbox (sender humano).
- [ ] Confirmar: chega no celular; linha em `messages` com `external_id = wamid` retornado pela Meta e `delivery_status = 'sent'`; `instance_name` = `instance_label` do número.
- [ ] Forçar uma falha (ex.: número inválido ou fora da janela) e confirmar `delivery_status='failed'` com `delivery_error` contendo `[code]`, mensagem e `fbtrace=...`.

### 4. Cloud API — SDR responde (loop completo)

- [ ] Lead manda mensagem → inbound carimba `leads.cloud_api_number_id` → SDR responde via `whatsapp-send` (senderType `ai`) → mensagem chega, `external_id` gravado.

### 5. Resolução de número

- [ ] Lead com `cloud_api_number_id` setado → respondido pelo `phone_number_id` desse número (vínculo).
- [ ] Lead sem vínculo (iniciado pela empresa) → respondido pelo número default (`is_default = true`).
- [ ] Empresa sem default e lead sem vínculo → `whatsapp-send` retorna 400 com erro claro e **não** envia.

---

## Critérios de pronto

- [ ] Empresa com `active_whatsapp_provider = 'cloud_api'` envia texto pela Cloud API e a mensagem chega no destinatário.
- [ ] Linha em `messages` tem `external_id = wamid` da Meta e `delivery_status = 'sent'`.
- [ ] Falha de envio grava `delivery_status = 'failed'` e `delivery_error` com `code` e `fbtrace_id`.
- [ ] Lead carimbado responde pelo número do vínculo; sem vínculo, pelo default; sem nenhum, erro claro sem enviar.
- [ ] O token da Meta nunca aparece em código ou env do Veltzy (só `phone_number_id` cruza a fronteira).
- [ ] Regressão Evolution verde (texto e mídia idênticos ao comportamento anterior).
- [ ] `cloud-api-send-message` deployado no Hub **antes** do ramo do Veltzy ser ligado.
- [ ] Migration 069 aplicada; `is_default` setado no número da Stark Tech.
- [ ] `process-message-queue`, templates e mistura de providers **não** foram tocados (escopo travado respeitado).
- [ ] PVO limpo: tudo commitado e pushado nos dois repos, branches no fluxo correto, working tree restaurada.
```

