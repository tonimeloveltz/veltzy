# Spec: Instagram Direct, Onda 1 (conectar, receber, responder)

> Derivada de `docs/features/instagram-dm/PRD.md`. Ler o PRD inteiro antes (decisões D1 a D9).
> Repos: `veltzy` (este) e `hub` (`../hub`), ambos na branch `instagram-integration`.
> Ambiente de trabalho: **staging** (`hfebvugdsztnzgpybdwj`). Produção é leitura.

## Resumo executivo

Reescrever as três functions de Instagram para a **Instagram API com Instagram Login** (`graph.instagram.com`), passar o inbound pelo `lead-inbound-handler`, criar a tela de conexão do admin, corrigir o roteamento de envio que hoje manda lead do Instagram para o WhatsApp, e acrescentar renovação de token e os callbacks obrigatórios da Meta. Uma migration aditiva no Hub.

## Pré-condições

- Hub: A7 fases 1 e 3 do Instagram aplicadas no staging (coluna `access_token` já não existe). A migration nova vem depois delas.
- `docs/features/instagram-dm/precheck.sql` rodado pela Leticia no staging com `contas_duplicadas_ativas = 0`.
- Nada do painel da Meta é pré-requisito para **escrever** o código. É pré-requisito para o teste no browser (PRD, seção 7).

## Escopo travado

Se surgir vontade de fazer qualquer item abaixo, **parar e reportar ao copiloto**:

- ❌ SDR IA, transfer, auto-reply e `escalate-to-human` enviando por Instagram (Onda 2). Nesta onda eles são **desligados** para o canal.
- ❌ Reações, mensagem apagada, ice breakers, menu persistente, comentários, resposta privada (Ondas 2 e 3)
- ❌ Mais de uma conta por empresa, fusão de contato IG + WhatsApp
- ❌ Tipo novo em `messages.message_type`, coluna nova em `messages` ou `leads`
- ❌ Trocar o placeholder `ig_<IGSID>` de `leads.phone` por `NULL`
- ❌ Ajustar exibição de telefone fora dos pontos listados na seção 7.6 (listar os outros no reporte)

## Proibido tocar

- `supabase/migrations/` do Veltzy (migration do Central mora no Hub)
- `hub/supabase/migrations/00000000000000_baseline.sql`
- `zapi-webhook`, `evolution-inbound`, `cloud-api-inbound`, `waha-inbound`, `sdr-ai`, `sdr-engine`, `run-automations`
- `src/styles/globals.css`, `src/stores/inbox.store.ts`
- Qualquer `db push`, `functions deploy`, `secrets set` ou SQL de escrita, em **qualquer** ambiente. Aplicar e deployar é passo da Leticia, depois de revisar o diff
- Commit sem a Leticia revisar o diff

---

## 1. Migration (repo do Hub)

### `hub/supabase/migrations/20260914120000_instagram_dm_onda1.sql` (novo)

Aditiva. Sem `BEGIN`/`COMMIT` (o CLI já envolve o arquivo em transação; conferir com `grep -nE "^\s*(BEGIN|COMMIT);"`).

```sql
-- =============================================================================
-- Instagram DM, Onda 1: conexao via Instagram Login
-- PRD/Spec: veltzy/docs/features/instagram-dm/
-- Aditiva. Linhas existentes (fluxo Facebook Login antigo) ficam como
-- auth_flow = 'facebook_login' e seguem funcionando ate reconectar.
-- Sem BEGIN/COMMIT: o CLI envolve o arquivo na propria transacao.
-- =============================================================================

ALTER TABLE veltzy.instagram_connections
  ALTER COLUMN page_id DROP NOT NULL;

ALTER TABLE veltzy.instagram_connections
  ADD COLUMN IF NOT EXISTS auth_flow text NOT NULL DEFAULT 'facebook_login'
    CHECK (auth_flow IN ('facebook_login', 'instagram_login')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'token_expired', 'revoked', 'error')),
  ADD COLUMN IF NOT EXISTS instagram_app_user_id text,
  ADD COLUMN IF NOT EXISTS instagram_name text,
  ADD COLUMN IF NOT EXISTS token_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN veltzy.instagram_connections.instagram_account_id IS
  'Id da conta profissional (GET /me?fields=user_id). E o entry.id dos webhooks.';
COMMENT ON COLUMN veltzy.instagram_connections.instagram_app_user_id IS
  'user_id devolvido na troca do code (api.instagram.com/oauth/access_token). Usado para casar signed_request de desautorizacao.';

-- D3: uma conta so pode estar ativa em uma empresa (o webhook resolve a empresa por entry.id).
CREATE UNIQUE INDEX IF NOT EXISTS instagram_connections_active_account_unique
  ON veltzy.instagram_connections (instagram_account_id)
  WHERE is_active AND instagram_account_id <> '';

-- RLS: a baseline liga RLS na tabela mas nao tem NENHUMA policy (as vz_ig_*
-- so existiam na 010 antiga do repo do Veltzy). Sem policy, o front le vazio.
-- So leitura para membros da empresa: quem escreve e edge function com service role.
DROP POLICY IF EXISTS "vz_ig_select" ON veltzy.instagram_connections;
CREATE POLICY "vz_ig_select" ON veltzy.instagram_connections
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() OR public.is_super_admin());
```

RLS: a tabela tem RLS ligado e **zero policies** na baseline do Hub (corrigido em 14/09, a versão anterior desta Spec citava policies que só existem na `010` antiga do Veltzy). A migration cria só a policy de leitura. Nenhuma policy de escrita: o front nunca escreve nessa tabela. Nenhuma coluna exposta é segredo. Entregar junto um SQL de leitura em `pg_policies` para a Leticia confirmar no staging antes e depois de aplicar.

Atualizar `src/types/database.ts#InstagramConnection` com as colunas novas (`page_id: string | null`, `auth_flow`, `status`, `instagram_app_user_id`, `instagram_name`, `token_refreshed_at`, `webhook_subscribed_at`, `last_error`). Tipos `InstagramConnectionStatus` e `InstagramAuthFlow` como unions.

---

## 2. Helpers compartilhados (Deno, `supabase/functions/_shared/`)

Todos puros ou quase puros, cada um com teste `*.test.ts` ao lado (padrão de `lead-inbound-handler.test.ts`; rodar com `npx --yes deno test`).

### 2.1 `instagram-graph.ts` (novo)
- `export const INSTAGRAM_GRAPH_VERSION = 'v26.0'` (decidido em 14/09: v26.0 lançada em 29/07/2026 é a mais recente; v25.0 segue suportada até 29/07/2028. Constante única)
- `export const INSTAGRAM_GRAPH_BASE = \`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}\``
- `interface GraphError { status: number; code: number | null; message: string }`
- `graphRequest<T>(path, { method, token, query?, body? }): Promise<{ ok: true; data: T } | { ok: false; error: GraphError }>`: token via header `Authorization: Bearer`, nunca em log. Lê `error.code` do corpo de erro da Meta.
- `isTokenInvalid(error: GraphError): boolean`: `code === 190`.
- Não loga URL completa (a troca de token leva `client_secret` na query).

### 2.2 `instagram-oauth-state.ts` (novo)
State assinado, sem tabela:
- `signState({ companyId, userId, nonce, exp }, secret): Promise<string>` → `base64url(json) + '.' + base64url(hmacSha256(json))`
- `verifyState(state, secret, now): Promise<StatePayload | null>`: `null` se assinatura não confere (comparação em tempo constante, reusar a ideia de `meta-signature.ts`) ou `exp < now`.
- Validade: 10 minutos.
- Testes: roundtrip, assinatura adulterada, expirado.

### 2.3 `instagram-signed-request.ts` (novo)
- `parseSignedRequest(signedRequest, appSecret): Promise<{ user_id: string; [k: string]: unknown } | null>`: formato `<sig b64url>.<payload b64url>`, HMAC-SHA256 do **trecho payload em base64url** com o app secret, `algorithm` deve ser `HMAC-SHA256`.
- Testes: válido, assinatura errada, algoritmo errado.

### 2.4 `instagram-window.ts` (novo)
```ts
export type InstagramWindow = 'open' | 'human_agent' | 'closed'
export const decideInstagramWindow = (
  lastInboundAt: Date | null, now: Date, humanAgentEnabled: boolean,
): InstagramWindow
```
- `null` → `closed` (a Meta só permite responder quem escreveu)
- até 24h → `open`
- até 7 dias e `humanAgentEnabled` → `human_agent`
- resto → `closed`
- Testes nas bordas (23h59, 24h01, 7d01, flag desligada).

### 2.5 `instagram-webhook-mapper.ts` (novo)
Função pura que converte **um** item de `entry[].messaging[]` em uma lista de ações. Sem acesso a banco, sem fetch.

```ts
export type InstagramWebhookAction =
  | { kind: 'inbound'; igAccountId: string; igsid: string; mid: string; content: string;
      messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
      fileUrl: string | null; fileMimeType: string | null; fileName: string | null;
      adContext: Record<string, unknown> | null; adId: string | null }
  | { kind: 'echo'; igAccountId: string; igsid: string; mid: string; content: string;
      messageType: 'text' | 'image' | 'video' | 'audio' | 'document'; fileUrl: string | null;
      fileMimeType: string | null; fileName: string | null }
  | { kind: 'read'; igAccountId: string; igsid: string; mid: string }
  | { kind: 'ignored'; reason: string }

export const mapInstagramMessaging = (entryId: string, item: unknown): InstagramWebhookAction[]
```

Mapeamento (payloads da doc "Webhooks for Instagram Messaging"):

| Entrada | Saída |
|---|---|
| `message.is_echo === true` | `echo`. **Atenção:** no echo `sender.id` é a conta da empresa e `recipient.id` é o contato, então `igsid = recipient.id` |
| `message.is_deleted === true` | `ignored: 'deleted'` (Onda 2) |
| `message.is_unsupported === true` | `inbound` texto `"[Mensagem não suportada. Veja no app do Instagram]"` |
| `message.text` sem anexo | `inbound` texto |
| `message.reply_to.story` | prefixo `"[Resposta ao seu story] "` no texto |
| `message.quick_reply.payload` | `inbound` texto (usa `message.text`) |
| `attachments[i].type = image` | `image`, `fileUrl = payload.url`, mime `image/jpeg` |
| `video` | `video`, mime `video/mp4` |
| `audio` | `audio`, mime `audio/mp4` |
| `file` | `document`, mime `application/pdf` |
| `share`, `ig_reel`, `reel`, `ig_post` | texto `"[Compartilhou uma publicação] <payload.url>"` (D9, sem download) |
| `story_mention` | texto `"[Mencionou sua empresa em um story] <payload.url>"` (D9) |
| tipo desconhecido | texto `"[Anexo não suportado: <type>]"` |
| vários anexos | uma ação por anexo. `mid` do primeiro é `message.mid`; dos demais `${message.mid}:${i}` (dedup do handler é por `external_id`) |
| texto + anexo | texto vai no `content` do primeiro anexo |
| `message.referral` com `source = 'ADS'` | `adContext = referral`, `adId = referral.ad_id ?? null` |
| `postback` | `inbound` texto com `postback.title`, `mid = postback.mid` |
| `read.mid` | `read` |
| `reaction` | `ignored: 'reaction'` (Onda 2) |
| sem `sender.id`, sem `mid`, formato inesperado | `ignored: '<motivo>'` |

Testes: um caso por linha da tabela, com os JSON da doc.

---

## 3. `lead-inbound-handler.ts` (alterar, mínimo)

Arquivo compartilhado com WhatsApp: **toda mudança condicionada a `params.source === 'instagram'`**. Nenhum comportamento de WhatsApp muda. Rodar o teste existente do handler antes e depois.

1. `InboundParams` ganha:
   ```ts
   /** IGSID do contato (source 'instagram'). Chave de busca do lead no lugar de phone. */
   instagramId?: string | null
   /** @ do contato, gravado em leads.instagram_handle na criacao e backfill quando nulo. */
   instagramUsername?: string | null
   ```
2. Passo 0 (source de origem): quando `source === 'instagram'` buscar `lead_sources.slug = 'instagram'` em vez de `'whatsapp'`.
3. Passo 1 (buscar lead): quando `source === 'instagram' && params.instagramId`, `.eq('instagram_id', params.instagramId)` em vez de `.eq('phone', ...)`. Incluir `instagram_handle` no select e fazer backfill do handle se vier e o lead estiver sem.
4. `createLead`: quando `source === 'instagram'`, o insert leva `instagram_id` e `instagram_handle`. `phone` continua `params.phone` (o caller passa `ig_<IGSID>`). Não existe unique em `instagram_id` no Central (só `UNIQUE (company_id, phone)`), e como o phone é `ig_<IGSID>` a corrida esbarra nela. Só no ramo instagram: insert com erro `23505` → rebuscar por `instagram_id` e seguir. Sem índice novo. O ramo WhatsApp não muda (hoje ele não trata corrida; fica no reporte).
5. Dispatch de SDR (bloco `params.source !== 'webhook' && !skipSideEffects`) e auto-reply (passo 8): **pular quando `source === 'instagram'`**, com `console.log('[instagram] SDR/auto-reply desligados para o canal nesta fase')`. Comentário citando a Onda 2.

---

## 4. Travas no WhatsApp (alterar, mínimo)

- `supabase/functions/_shared/phone.ts`: `export const isInstagramPlaceholderPhone = (phone: string | null | undefined): boolean => !!phone && phone.startsWith('ig_')`
- `whatsapp-send/index.ts`: logo depois de carregar o lead, se `isInstagramPlaceholderPhone(lead.phone)` → `422 { error: 'lead_sem_whatsapp' }`, sem chamar provider e sem gravar mensagem.
- `process-message-queue/index.ts`: mesma checagem junto do `!lead?.phone` → `status: 'failed'`, `error_message: 'Lead sem WhatsApp (contato do Instagram)'`.

---

## 5. Edge functions do Instagram

Padrão de todas: `getCorsHeaders(req)`, respostas JSON, client `veltzy` com service role para dados e client `public` com service role para Vault. Nunca logar token, code, state ou signed_request.

### 5.1 `instagram-oauth/index.ts` (reescrever)

`verify_jwt = true` (já está). Autenticação: `auth.getUser`, `company_id` **do perfil**, nunca do body. Ações que alteram exigem papel `admin` ou `super_admin` em `user_roles` para aquela empresa → senão `403`.

| `action` | Papel | Comportamento |
|---|---|---|
| `status` | membro | Devolve `{ connection: { instagram_username, instagram_name, status, is_active, auth_flow, token_expires_at, webhook_subscribed_at, last_error } \| null }`. (O front também pode ler direto por RLS; a action existe para o card não depender do select de colunas) |
| `authorize` | admin | Confere flag `instagram_enabled` da empresa (`409 instagram_nao_habilitado` se desligada). Monta `https://www.instagram.com/oauth/authorize?client_id=INSTAGRAM_APP_ID&redirect_uri=INSTAGRAM_REDIRECT_URI&response_type=code&scope=instagram_business_basic,instagram_business_manage_messages&state=<signState>`. **`redirect_uri` vem só do env**, nunca do body. Devolve `{ url }` |
| `callback` | admin | Body `{ code, state }`. Fluxo abaixo |
| `disconnect` | admin | `is_active = false`, `status = 'revoked'`, `guardarSegredo(nome, '')` (o `lerSegredo` trata vazio como ausente). Não apaga a linha. Devolve `{ success: true }` |

Fluxo `callback`:
1. `verifyState(state)` → payload. Exigir `payload.userId === user.id` e `payload.companyId === profile.company_id`, senão `403 state_invalido`.
2. Remover `#_` do fim do `code` se vier.
3. `POST https://api.instagram.com/oauth/access_token` (form-urlencoded: `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`, `code`) → `access_token` curto, `user_id` (guardar como `instagram_app_user_id`).
4. `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=...&access_token=<curto>` → `access_token` longo, `expires_in`.
5. `GET /me?fields=user_id,username,name,account_type` → `instagram_account_id = user_id`, `instagram_username`, `instagram_name`.
6. Conta já ativa em **outra** empresa (select pelo `instagram_account_id`, `is_active`, `company_id <> atual`) → `409 conta_em_outra_empresa`, sem gravar nada.
7. `guardarSegredo(instagramTokenSecretName(companyId), tokenLongo)` **antes** do upsert (mesma ordem do A7).
8. Upsert `onConflict: 'company_id'`: `instagram_account_id`, `instagram_app_user_id`, `instagram_username`, `instagram_name`, `page_id: null`, `page_name: null`, `auth_flow: 'instagram_login'`, `status: 'active'`, `is_active: true`, `token_expires_at: now + expires_in`, `token_refreshed_at: now`, `last_error: null`, `created_by: user.id`.
9. `POST /me/subscribed_apps?subscribed_fields=messages,message_echoes,messaging_seen,messaging_postbacks,messaging_referral,message_reactions`. Sucesso → `webhook_subscribed_at = now`. Falha → **não desfaz a conexão**: `status = 'error'`, `last_error = 'Falha ao inscrever webhook: <mensagem da Meta>'`, e o card mostra "Reconectar".
10. Erro em 3, 4 ou 5 → `400 { error: 'oauth_falhou', detail: <mensagem da Meta sem segredo> }`.

### 5.2 `instagram-webhook/index.ts` (reescrever)

`verify_jwt = false` (já está).

- `GET`: verificação `hub.mode`/`hub.verify_token`/`hub.challenge` contra `INSTAGRAM_VERIFY_TOKEN` (manter).
- `POST`: ler corpo cru, validar `x-hub-signature-256` com `INSTAGRAM_APP_SECRET`; se não conferir e `META_APP_SECRET` existir, tentar com ele. Nenhum confere ou nenhum configurado → `401`. (Com Instagram Login a Meta assina com o secret do produto Instagram; o fallback cobre app compartilhado.)
- `payload.object !== 'instagram'` → `200 { ok: true, ignored: true }`.
- Para cada `entry` e cada item de `entry.messaging`: `mapInstagramMessaging(entry.id, item)`. **Cada ação em `try/catch` próprio**: erro de um item é logado e não derruba os demais. Resposta final sempre `200` (a Meta reenvia por 36h e pode desativar o webhook se falhar muito).
- Resolver conexão por `instagram_account_id = igAccountId` e `is_active = true` (cache por request). Sem conexão → `console.warn('[instagram-webhook] sem conexao ativa', { entryId })` e segue.
- **`inbound`**:
  1. Buscar o perfil só quando o lead com esse `instagram_id` não existe, ou existe sem `avatar_url` **e** sem `instagram_handle` (contato sem foto não gera uma chamada por mensagem): `GET /<igsid>?fields=name,username,profile_pic` com o token do Vault (erro aqui não impede a mensagem; só loga).
  2. `handleInboundMessage({ source: 'instagram', companyId, phone: \`ig_${igsid}\`, instagramId: igsid, instagramUsername: username, senderName: name ?? (username ? \`@${username}\` : null), content, messageType, externalId: mid, fileUrl, fileName, fileMimeType, instanceName: null, adContext, adId, profilePicUrl: profile_pic ?? null, supabaseUrl, supabaseKey })`.
- **`echo`**:
  1. Já existe mensagem com `external_id = mid` na empresa → ignorar (é a que o Veltzy mandou).
  2. Senão, procurar a mensagem do Veltzy correspondente: mesmo lead (`instagram_id = igsid`), `source = 'instagram'`, `sender_type <> 'lead'`, `created_at` nos últimos 120s, e:
     - echo de **anexo**: `external_id IS NULL` e mesmo `message_type` (o echo de anexo não traz texto)
     - echo de **texto**: mesmo `content` e (`external_id IS NULL` **ou** `message_type <> 'text'`). O segundo caso é a legenda enviada em segunda chamada, que fica na linha da mídia. Texto com `external_id` já preenchido **não** casa: senão a segunda resposta igual do dono pelo app ("ok", "ok") se perde (achado da revisão de 14/09)
     Achou → `update external_id = mid` **só se estiver nulo**, e ignorar.
  3. Senão (dono respondeu pelo app) → `handleInboundMessage({ ...inbound, senderType: 'human', skipSideEffects: true, senderName: null })`.
- **`read`**: achar lead pelo `instagram_id`; `update messages set delivery_status = 'read'` onde `company_id`, `lead_id`, `source = 'instagram'`, `sender_type <> 'lead'`, `delivery_status in ('sent','delivered')` e `created_at <=` o `created_at` da mensagem com `external_id = mid` (se não achar a mensagem, só a do `mid` não existe e nada é atualizado).
- **`ignored`**: `console.log` com o motivo.

### 5.3 `instagram-send/index.ts` (reescrever)

`verify_jwt = true` (já está). Só usuário (sem ramo service role nesta onda; a Onda 2 acrescenta, espelhando o `whatsapp-send`).

Body:
```ts
interface InstagramSendBody {
  leadId: string
  content: string
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document'
  fileUrl?: string
  fileName?: string
  mimeType?: string
}
```
`companyId` do body, se vier, é **ignorado**.

1. Auth e `companyId` do perfil (manter o C4).
2. Lead por `id` + `company_id`; sem `instagram_id` → `400 lead_sem_instagram`.
3. Conexão da empresa com `is_active` e `status = 'active'` → senão `409 instagram_desconectado`. Token do Vault vazio → mesmo `409`.
4. Janela: último `messages.created_at` com `lead_id`, `company_id`, `source = 'instagram'`, `sender_type = 'lead'`. `decideInstagramWindow(last, now, Deno.env.get('INSTAGRAM_HUMAN_AGENT_ENABLED') === 'true')`. `closed` → `422 { error: 'instagram_window_closed' }`, sem gravar mensagem.
5. `fileUrl`, se vier, precisa começar com `${SUPABASE_URL}/storage/v1/object/` → senão `400 file_url_invalida` (evita usar a function para mandar URL arbitrária).
6. Validação de tipo por allowlist de mime (formatos da doc da Meta), senão `400 formato_nao_suportado_instagram`:
   - `image`: `image/png`, `image/jpeg`
   - `audio`: `audio/aac`, `audio/mp4`, `audio/m4a`, `audio/x-m4a`, `audio/wav`, `audio/x-wav` (**`audio/webm` do gravador do Veltzy não entra**)
   - `video`: `video/mp4`, `video/ogg`, `video/x-msvideo`, `video/quicktime`, `video/webm`
   - `document`: `application/pdf`
   A allowlist mora num helper puro com teste, usado pelo servidor e espelhado no front.
7. Inserir mensagem **antes** da chamada: mesmos campos que o `whatsapp-send` grava para humano (conferir o insert dele: `sender_type`, `sender_id` se existir, `replied_message_id`, etc.), com `source: 'instagram'`, `delivery_status: 'pending'`, `instance_name: null`, `message_type`, `file_url`, `file_name`, `file_mime_type` (nomes das colunas conforme o insert do `whatsapp-send`).
8. `POST /me/messages` com Bearer:
   - texto: `{ recipient: { id }, message: { text: content } }`
   - mídia: `{ recipient: { id }, message: { attachment: { type: 'image'|'video'|'audio'|'file', payload: { url: fileUrl } } } }` (`document` → `file`). Segunda chamada de texto depois da mídia **só se `content` não for vazio e for diferente de `fileName`** (o `chat-input` manda o nome do arquivo como content e o `audio-recorder` manda vazio).
   - `human_agent` → acrescentar `messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT'`.
9. Sucesso → `update external_id = message_id, delivery_status = 'sent'`. Erro → `delivery_status = 'failed'` e, se `isTokenInvalid`, `instagram_connections.status = 'token_expired'`, `last_error`.
10. Devolve a linha da mensagem atualizada (mesmo contrato do `whatsapp-send`), `200` também quando `failed` (o bubble mostra a falha).

### 5.4 `instagram-token-refresh/index.ts` (novo)

- Auth: `_shared/cron-auth.ts` (`isCronAuthorized`), igual às cinco functions de cron.
- Seleciona conexões `is_active`, `auth_flow = 'instagram_login'`, `status in ('active','error')`, `token_expires_at < now() + 15 dias`, e (`token_refreshed_at IS NULL` ou `< now() - 24h`, regra da Meta).
- Para cada: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<atual>` → `guardarSegredo` do novo, `token_expires_at = now + expires_in`, `token_refreshed_at = now`, `last_error = null`.
- Falha com token inválido → `status = 'token_expired'`, `last_error`. Outras falhas → só `last_error`.
- Devolve `{ checked, refreshed, failed }`.
- `config.toml`: `[functions.instagram-token-refresh] verify_jwt = false`.
- **Cron:** não versionar. Escrever o SQL do `cron.schedule('instagram-token-refresh', '0 9 * * *', ...)` num arquivo no scratchpad da codificadora, lendo a key do Vault com `public.ai_secret_read('cron_service_role_key')` e montando o header com `jsonb_build_object` (mesmo padrão dos cinco crons consertados em 02/09). Entregar o caminho do arquivo para a Leticia, que roda no staging.

### 5.5 `instagram-deauthorize/index.ts` e `instagram-data-deletion/index.ts` (novos)

`verify_jwt = false` nos dois. A Meta faz `POST` form-urlencoded com `signed_request`.

- `parseSignedRequest(signed_request, INSTAGRAM_APP_SECRET)` → `null` → `400`.
- Conexão por `instagram_app_user_id = user_id` **ou** `instagram_account_id = user_id`.
- **deauthorize:** `is_active = false`, `status = 'revoked'`, `last_error = 'App removido pelo Instagram'`, segredo sobrescrito com `''`. Responde `200 { ok: true }`.
- **data-deletion:** o mesmo, e responde `200 { url: \`${APP_URL}/privacidade\`, confirmation_code: crypto.randomUUID() }`. Logar `confirmation_code` + `company_id` (`console.log`, sem dado pessoal). Não apaga leads nem mensagens (PRD, seção 8).
- Sem conexão correspondente → responde igual (a Meta exige resposta válida) e loga.

### 5.6 `supabase/config.toml`
Acrescentar as três functions novas com `verify_jwt = false`. Não mexer nas outras entradas.

---

## 6. Secrets (lista para a Leticia configurar no staging, a codificadora não configura)

| Secret | Uso |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram App ID (painel Meta > Instagram > API setup with Instagram login) |
| `INSTAGRAM_APP_SECRET` | Instagram App Secret. Troca de token, assinatura do webhook, signed_request |
| `INSTAGRAM_VERIFY_TOKEN` | Verificação do webhook |
| `INSTAGRAM_REDIRECT_URI` | `https://<front do ambiente>/integracoes/instagram/callback`, idêntica à cadastrada na Meta |
| `INSTAGRAM_OAUTH_STATE_SECRET` | HMAC do `state` (32+ bytes aleatórios) |
| `INSTAGRAM_HUMAN_AGENT_ENABLED` | `false` até a Meta aprovar a tag |
| `APP_URL` | Conferir se já existe com outro nome (grep nas functions) antes de criar |

Documentar essa tabela em `.env.example`? **Não** (é secret de edge function). Acrescentar em `docs/AMBIENTES.md` na seção de secrets, uma linha por secret, sem valor.

---

## 7. Front

Ordem: types → service → hooks → componentes → página → rota.

### 7.1 `src/lib/lead-channel.ts` (novo) + `lead-channel.test.ts`
```ts
export const isInstagramPlaceholderPhone = (phone: string | null | undefined): boolean
export const leadContactLabel = (lead: { phone: string; instagram_handle?: string | null }): string
// placeholder → '@handle' ou 'Instagram'; senao o phone
export type InstagramWindowState = 'open' | 'closing' | 'closed'
export const instagramWindowState = (lastCustomerMessageAt: string | null, now: Date): InstagramWindowState
// closing = menos de 2h para fechar. Aproximacao de UX: o servidor e a autoridade (5.3 passo 4)
export type OutboundChannel = 'whatsapp' | 'instagram' | 'manual'
export const decideOutboundChannel = (input: {
  lastInboundSource: string | null; phone: string | null; instagramId: string | null
  whatsAppConnected: boolean; instagramConnected: boolean
}): OutboundChannel
```
`decideOutboundChannel` (D5):
1. `lastInboundSource === 'instagram'` e `instagramConnected` e `instagramId` → `instagram`
2. `lastInboundSource === 'whatsapp'` e phone real e `whatsAppConnected` → `whatsapp`
3. phone real e `whatsAppConnected` → `whatsapp`
4. `instagramId` e `instagramConnected` → `instagram`
5. `manual`

"phone real" = não vazio e não placeholder. Testes para cada regra e para o caso do bug atual (placeholder + WhatsApp conectado → nunca `whatsapp`).

### 7.2 `src/lib/phone.ts` (alterar)
`leadDisplayName(name, phone)`: sem nome e phone placeholder → `'Contato do Instagram'`. Nada mais muda na função.

### 7.3 `src/services/messages.service.ts` (alterar)
- `getLeadPhoneAndSource` passa a trazer `instagram_id` (renomear para `getLeadRoutingInfo` só se não quebrar outros usos; grepar antes).
- Nova `getLastInboundSource(companyId, leadId)`: `messages.select('source')` com `company_id`, `lead_id`, `sender_type = 'lead'`, `order created_at desc`, `limit 1`.
- `isInstagramConnected`: acrescentar `.eq('status', 'active')`.
- `routeMessage` usa `decideOutboundChannel`. Ramo `instagram` chama `instagram-send` com `{ leadId, content, messageType, fileUrl, fileName, mimeType }` (sem `companyId`).
- Erro `instagram_window_closed` precisa chegar ao hook como erro identificável (ler o corpo de `FunctionsHttpError` com `error.context.json()`, conferir como o projeto já faz em outro service antes de inventar).

### 7.4 `src/services/instagram.service.ts` (novo)
Funções puras sobre o client: `getInstagramConnection(companyId)` (select por RLS das colunas não secretas, filtrando `company_id`), `startInstagramAuthorize()`, `completeInstagramOAuth(code, state)`, `disconnectInstagram()`. As três últimas via `supabase.functions.invoke('instagram-oauth', ...)`.

### 7.5 Hooks (um por arquivo)
- `src/hooks/use-instagram-connection.ts` (query; key em `src/lib/query-keys.ts` se o projeto centraliza lá)
- `src/hooks/use-connect-instagram.ts` (mutation: pega a URL e faz `window.location.assign(url)`)
- `src/hooks/use-disconnect-instagram.ts` (mutation + invalidate)
- `src/hooks/use-instagram-oauth-callback.ts` (lê `code`, `state`, `error`, `error_reason` da URL, chama `completeInstagramOAuth` uma única vez mesmo com StrictMode, devolve `{ status: 'loading' | 'success' | 'error', message }`)

Mapear códigos de erro para copy pt-BR (sem travessão): `conta_em_outra_empresa` → "Esta conta do Instagram já está conectada a outra empresa no Veltzy."; `state_invalido` → "O link de conexão expirou. Tente conectar de novo."; `instagram_nao_habilitado` → "O Instagram não está habilitado para a sua empresa. Fale com o suporte."; `error=access_denied` → "Conexão cancelada no Instagram."; genérico → "Não foi possível conectar o Instagram. Tente de novo."

### 7.6 Componentes
- **`src/components/admin/instagram-connection-card.tsx`** (novo, até ~200 linhas; decompor em `instagram-connection-status.tsx` se passar). Substitui o `<HubManagedCard title="Instagram Business" ...>` em `integrations-tab.tsx` (só essa linha muda lá). Estados:
  - flag `instagram_enabled` desligada → card informativo "Não habilitado para a sua empresa", sem botão (usar o hook de feature flag que o `ProtectedRoute requireFeature` já usa)
  - sem conexão ativa → descrição + botão "Conectar Instagram" (só admin/super_admin; demais veem "Peça a um administrador para conectar")
  - `active` → `@username`, nome, badge "Conectado", "Token válido até dd/mm/aaaa" (fuso America/Sao_Paulo), botões "Reconectar" e "Desconectar" (este com `AlertDialog`)
  - `token_expired`, `revoked`, `error` ou expira em menos de 7 dias → alerta com `last_error` legível e botão "Reconectar"
  - `auth_flow = 'facebook_login'` → alerta "Conexão antiga. Reconecte para usar a nova integração."
  - Tokens semânticos apenas (`bg-muted`, `text-muted-foreground`, `text-destructive`...). Ícone `Camera` do `lucide-react` (a 1.8 não exporta `Instagram`, e o projeto já usa `Camera` para Instagram em `lead-source-badge.tsx` e `lead-sources-manager.tsx`). Vale também para o `conversation-item.tsx`.
- **`src/components/inbox/instagram-window-notice.tsx`** (novo): renderizado pelo `chat-input.tsx` quando o canal da conversa é Instagram (`isInstagramPlaceholderPhone(lead.phone)` ou `lead.instagram_id` sem phone real). `closing` → aviso "A janela de resposta do Instagram fecha em Xh". `closed` → "O contato precisa mandar uma nova mensagem para você responder pelo Instagram." e o input fica desabilitado.
- **`chat-window.tsx`**: passar `lead` como prop para o `ChatInput` (hoje só recebe `leadId`).
- **`chat-input.tsx`**: o gate `hasInstance` ("Configure seu numero WhatsApp") é pulado quando o canal for Instagram. Quando o canal for Instagram, `accept="image/png,image/jpeg,video/*,audio/*,.pdf"` e validar formato (mesma allowlist da 5.3 passo 6) e tamanho antes do upload (imagem 8 MB, demais 25 MB) com toast, por uma função pura em `src/lib` com teste (não inline no componente, que já passa do limite de linhas). **O `AudioRecorder` não aparece em conversa do Instagram** nesta onda: ele grava `audio/webm`, formato que a Meta recusa. Converter o áudio fica para a Onda 2. Erro `instagram_window_closed` vira toast com a mesma copy do notice.
- **`chat-header.tsx:73`** e **`contact-panel.tsx:251`**: trocar `{lead.phone}` por `{leadContactLabel(lead)}`.
- **`conversation-item.tsx`**: ícone pequeno do Instagram (`h-3 w-3 text-muted-foreground`) ao lado do nome quando o lead é do Instagram.
- Grepar outros lugares que exibem `lead.phone` cru (contatos, pipeline, export) e **listar no reporte, sem alterar**.

### 7.7 Página e rota
- `src/pages/instagram-callback-page.tsx` (fina: só compõe) com um componente `src/components/admin/instagram-oauth-callback.tsx` que usa `useInstagramOAuthCallback`: loading, sucesso (redireciona para a aba de integrações do admin, conferir a query string real da aba em `AdminPage`) ou erro com botão "Voltar para integrações".
- `App.tsx`: `<Route path="/integracoes/instagram/callback" element={<ProtectedRoute requireRole={['admin', 'super_admin']}><InstagramCallbackPage /></ProtectedRoute>} />` dentro do bloco autenticado.

---

## 8. Ordem de implementação

1. Migration do Hub (seção 1) + types do front
2. Helpers da seção 2 com testes (red → green)
3. Handler (seção 3) + travas (seção 4), rodando o teste existente do handler
4. Functions (seção 5) e `config.toml`
5. Front (seção 7) com testes de `lead-channel.ts`
6. SQL do cron no scratchpad, linha no `docs/AMBIENTES.md`
7. PVO (seção 10) e reporte (seção 11)

Commits atômicos em conventional commits, **só depois de a Leticia revisar o diff**. Migration do Hub é commit no repo do Hub.

---

## 9. Critérios de aceite

Automatizáveis (codificadora):

- **CA-A1** `npx --yes deno test` dos arquivos `instagram-*.test.ts` passa com type-check. `lead-inbound-handler.test.ts` já falha no type-check antes desta feature (8x TS2345, client de schema `veltzy` onde se espera `public`): critério é a mesma falha de tipo antes e depois e todos os testes passando com `--no-check`.
- **CA-A1b** No Inbox o rótulo do contato do Instagram é "Instagram", não o @: a RPC `get_conversation_list` não devolve `instagram_handle`. Mudar a RPC fica para depois (reporte).
- **CA-A2** `npx vitest run src/lib/lead-channel.test.ts` (ou o runner do projeto) passa, incluindo o caso "placeholder + WhatsApp conectado nunca vai para WhatsApp".
- **CA-A3** `grep -rn "v18.0" supabase/functions` volta vazio.
- **CA-A4** `grep -rn "access_token" supabase/functions/instagram-*` não mostra token em `console.*`.
- **CA-A5** Migration sem `BEGIN`/`COMMIT`.

No staging, pela Leticia, depois de aplicar, deployar e configurar a Meta (cada um é falsificável):

- **CA-B1** Admin clica "Conectar Instagram", autoriza no instagram.com e volta ao Veltzy com o card mostrando `@username` e "Conectado". Um vendedor logado não vê o botão, e chamar `instagram-oauth` com `action: 'authorize'` pelo token dele devolve `403`.
- **CA-B2** A linha em `veltzy.instagram_connections` tem `auth_flow = 'instagram_login'`, `token_expires_at` cerca de 60 dias à frente e `webhook_subscribed_at` preenchido.
- **CA-B3** Da conta tester, mandar "oi" no Direct: em até 15s aparece no Inbox com nome ou @ e foto, nunca `ig_...`. O lead tem `instagram_id`, origem Instagram e um negócio no pipeline.
- **CA-B4** Mandar a mesma DM duas vezes seguidas gera duas mensagens, e reenviar o mesmo webhook (reentrega da Meta) não duplica.
- **CA-B5** Da conta tester, mandar foto e áudio: aparecem como bubble de imagem e de áudio tocável, com `file_url` no storage.
- **CA-B6** Responder texto e uma imagem PNG pelo Veltzy: chegam no app do Instagram. A mensagem tem `external_id` e `delivery_status = 'sent'`, e vira `read` depois que a tester abre a conversa.
- **CA-B7** O dono responde pelo app do Instagram: a resposta aparece no Veltzy como mensagem humana. A resposta enviada pelo Veltzy em CA-B6 aparece **uma vez só**.
- **CA-B8** Numa empresa com WhatsApp **e** Instagram conectados, responder o lead do CA-B3 chega pelo Instagram, e os logs do `whatsapp-send` não mostram chamada para esse lead.
- **CA-B9** Lead do Instagram com IA ativa: nenhuma resposta do SDR, nenhum log de `sdr-ai`/`sdr-engine` para ele.
- **CA-B10** Empurrar a última mensagem do contato para 25h atrás (SQL de staging) e tentar responder: input desabilitado com o aviso, e chamada direta ao `instagram-send` devolve `422 instagram_window_closed`.
- **CA-B11** POST no `instagram-webhook` com assinatura errada devolve `401`. GET com verify token errado devolve `403`.
- **CA-B12** Conectar a mesma conta em uma segunda empresa de teste mostra "Esta conta do Instagram já está conectada a outra empresa no Veltzy." e a primeira segue conectada.
- **CA-B13** "Desconectar": card volta para "Conectar Instagram", nova DM não entra no Inbox (log `sem conexao ativa`), envio devolve `409`.
- **CA-B14** Invocar `instagram-token-refresh` com o cron secret numa conexão com `token_refreshed_at` de mais de 24h: `token_refreshed_at` e `token_expires_at` avançam.
- **CA-B15** Remover o app em Configurações do Instagram da tester: a conexão fica `revoked` e o card pede reconexão.
- **CA-B16** Regressão WhatsApp: receber e responder uma conversa de WhatsApp continua igual.

## 10. PVO (codificadora transcreve a saída, não resume)

1. `npx tsc -b` (o `tsc --noEmit` não checa nada neste repo)
2. `npm run build`
3. `npm run lint`, comparando com a baseline medida no merge-base com a `origin/develop` (lint também cobre `supabase/functions`)
4. `npx --yes deno check` nas functions tocadas e `npx --yes deno test` dos testes novos
5. `git diff --stat` nos dois repos
6. Teste no browser: é da Leticia (CA-B*). Não declarar pronto sem ele.

## 11. Reporte da codificadora ao copiloto

- Saída do PVO (itens 1 a 5)
- Arquivos criados e alterados nos dois repos
- Caminho do SQL do cron no scratchpad
- Lugares que exibem `lead.phone` cru e não foram alterados (7.6)
- Tudo que divergiu da Spec e por quê (ex.: versão da Graph API, nome real de coluna no insert do `whatsapp-send`)
- Achados fora do escopo, só descritos

## 12. Promoção para produção (fora desta entrega, registro)

Ordem obrigatória: A7 do Instagram (fases 1 e 3) em produção → esta migration → deploy das functions → secrets e painel da Meta do app de produção → cron. Produção hoje roda o código antigo lendo `access_token` da coluna: deployar as functions novas antes do A7 fase 1 **não quebra** (elas só leem o Vault), mas as conexões antigas ficam sem token até reconectar.
