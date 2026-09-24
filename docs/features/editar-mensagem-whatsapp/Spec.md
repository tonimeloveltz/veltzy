# Spec, editar mensagem enviada no WhatsApp

> Sem PRD previo. A pesquisa de viabilidade foi feita direto no codigo e nos docs
> dos providers (sessao de 21/09/2026) e esta resumida em "Contexto" abaixo.

## Resumo executivo

Permitir que o vendedor edite o texto de uma mensagem ja enviada pela inbox, com a
edicao refletida no WhatsApp do lead, nos dois unicos providers que suportam isso
(Evolution e WAHA), dentro da janela de 15 minutos do proprio WhatsApp.

## Contexto (o que a pesquisa achou)

Suporte a edicao na API de cada provider ativo no Veltzy:

| Provider | Edita? | Endpoint |
|---|---|---|
| WAHA | Sim (WEBJS, WPP, GOWS, NOWEB) | `PUT /api/{session}/chats/{chatId}/messages/{messageId}`, body `{ "text": "..." }` |
| Evolution API v2 | Sim (so texto) | `POST /chat/updateMessage/{instance}`, body `{ number, key: { remoteJid, fromMe, id }, text }` |
| Cloud API (Meta) | Nao | Meta nao expoe edicao |
| Z-API (legado) | Nao | Os docs tem `delete-message` e `send-edit-event` (edita evento, nao mensagem) |

Tres achados que mudam o desenho:

1. **O `external_id` do outbound nao e gravado hoje nos providers que editam.**
   `supabase/functions/whatsapp-send/index.ts` so preenche `externalId` no ramo
   `cloud_api` (linha 209, usada na linha 256). No ramo Evolution/WAHA o retorno do
   `provider.sendMessage` e descartado. Sem o id do provider nao existe edicao.
   Consequencia de produto: **so mensagens enviadas depois do deploy serao editaveis.**
   Isso nao tem workaround, nao da para recuperar o id de mensagens antigas.
2. **A `veltzy.messages` nao tem policy de UPDATE para `authenticated`.** A baseline do
   Hub tem "Members can insert messages" e "Members can view messages", e mais nada. Com
   RLS ligada, UPDATE do frontend e negado por padrao. Logo a edicao tem que passar por
   edge function com service role, e nao por um `db().from('messages').update()`.
   Nao criar policy de UPDATE: a negacao no banco e a garantia de que o conteudo so muda
   pelo caminho que tambem chama o WhatsApp.
3. **Nao ha risco de colisao no indice unico `(company_id, external_id)`.** Os webhooks do
   Hub descartam `fromMe` (`hub/supabase/functions/waha-webhook-receiver/index.ts:132` e
   `evolution-webhook-receiver/index.ts:339`), entao a mensagem que sai nao volta pelo
   inbound. Manter isso verdadeiro ao mexer no envio.

## Escopo V1

- Mensagens **de texto** (`message_type = 'text'`).
- Mensagens **que sairam da empresa** (`sender_type != 'lead'`, ou seja human e ai).
- Providers **evolution** e **waha**.
- Mensagens com `external_id` preenchido e `delivery_status != 'failed'`.
- Dentro de **15 minutos** do envio (limite do WhatsApp, nao nosso).
- Quem pode: qualquer membro que ja enxerga a conversa. Sem gate de role.

## Fora de escopo

- Apagar mensagem no WhatsApp (as duas APIs tem `DELETE`, fica para uma onda 2; hoje o
  "apagar" da inbox so remove linhas do banco e nao toca no WhatsApp, ver
  `src/services/messages.service.ts:58`).
- Editar legenda de midia. A Evolution tem `// TODO: corrigir updateMessage para medias`
  no proprio router; nao prometer o que o provider nao entrega.
- Cloud API e Z-API. A UI simplesmente nao oferece a acao nesses leads.
- Historico de versoes. Guarda-se apenas o texto original, nao cada edicao.

## Pre-condicoes

- [ ] Confirmar que `veltzy.messages.whatsapp_provider` e `veltzy.leads.whatsapp_provider`
      existem no Central. A migration que as cria (`supabase/migrations/073_leads_whatsapp_provider.sql`)
      esta no repo do Veltzy, fora da convencao (ver "Onde mora a migration"). Conferir com
      `npx supabase inspect db` ou pedindo um SELECT a Leticia antes de depender das colunas.
- [ ] Secrets ja existentes, nada novo: `HUB_SUPABASE_URL`, `HUB_SERVICE_ROLE_KEY` no Veltzy;
      `WAHA_API_KEY_GLOBAL` e `EVOLUTION_API_KEY_GLOBAL` no Hub.
- [ ] `npx tsc -b` e `npm run build` limpos antes de comecar (baseline).

## Onde mora a migration

No **Hub** (`/home/leticia/Documentos/Veltz-Group/hub/supabase/migrations/`), com nome
timestamp `YYYYMMDDHHMMSS_*.sql`, mesmo sendo tabela do schema `veltzy`: o ledger de
migrations e por banco, e o historico do Central quem mantem e o Hub. Nao criar `074_*.sql`
no repo do Veltzy. Sem `BEGIN`/`COMMIT` no arquivo, o CLI ja envolve em transacao.

---

## Arquivos a criar

### `hub/supabase/migrations/<timestamp>_messages_edited.sql` (novo)

**Proposito:** colunas de auditoria da edicao.

**O que implementar:**
- `edited_at timestamptz NULL` e `original_content text NULL` em `veltzy.messages`.
- `COMMENT` em cada coluna explicando o uso e a base LGPD.
- Sem indice: nao ha consulta por essas colunas.

**Snippet de referencia:**
```sql
-- =====================================================================
-- Edicao de mensagem enviada (veltzy.messages)
--
-- edited_at:        quando a mensagem foi editada no WhatsApp. NULL = nunca
--                   editada. A UI mostra "editada" quando nao e NULL.
-- original_content: texto como foi enviado da primeira vez. Gravado so na
--                   PRIMEIRA edicao (COALESCE), entao ele e sempre o original
--                   e nao a versao anterior.
--
-- LGPD: o original fica guardado por prestacao de contas do atendimento
-- (o que foi de fato dito ao titular). Nao e dado novo do titular, e o mesmo
-- conteudo que ja estava em messages.content, e segue a retencao e o cascade
-- de exclusao da propria tabela (apagar o lead apaga as mensagens).
--
-- Mora aqui no Hub, e nao no repo do Veltzy: o ledger de migrations e por
-- BANCO, e o historico do Central quem mantem e o Hub.
--
-- Sem BEGIN/COMMIT: o CLI envolve o arquivo na propria transacao.
-- =====================================================================

ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_content TEXT;

COMMENT ON COLUMN veltzy.messages.edited_at IS
  'Quando a mensagem foi editada no WhatsApp. NULL = nunca editada.';

COMMENT ON COLUMN veltzy.messages.original_content IS
  'Texto do primeiro envio. Gravado so na primeira edicao (COALESCE): e sempre o original, nao a versao anterior.';
```

---

### `hub/supabase/functions/waha-edit-message/index.ts` (novo)

**Proposito:** unico ponto que fala com a WAHA para editar. Espelha `waha-send-message`.

**O que implementar:**
- Mesma moldura de `waha-send-message`: CORS, so POST, `getAdminClient`, `authenticateUser`,
  service_role exige `company_id` + `session_name` no body.
- Valida a sessao em `waha_instances` (existe, pertence a empresa, `status = 'connected'`).
- Monta `chatId` com os digitos do telefone + `@c.us` e **URL-encoda** `chatId` e `messageId`
  (o `@` vira `%40`, exigencia documentada da WAHA).
- `PUT` via `wahaFetch`.

**Snippet de referencia (miolo, a moldura e copia de `waha-send-message`):**
```ts
const { session_name, company_id: bodyCompanyId, to, message_id, text } = await req.json()
if (!to || !message_id || typeof text !== 'string' || !text.trim()) {
  return new Response(JSON.stringify({ success: false, error: 'to, message_id e text obrigatorios' }), { status: 400, headers })
}

// ... mesma resolucao de companyId/resolvedSession e validacao de waha_instances
// que existe em waha-send-message ...

const config = await getWahaConfig(supabaseAdmin)

// chatId no mesmo formato do envio; o @ vai encodado no path (%40), exigencia da WAHA.
const chatId = `${to.replace(/\D/g, '')}@c.us`
const path = `/api/${resolvedSession}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(message_id)}`

const wahaRes = await wahaFetch(config.base_url, path, { method: 'PUT', body: { text } })
if (!wahaRes.ok) {
  console.error('WAHA edit error:', await wahaRes.text())
  return new Response(JSON.stringify({ success: false, error: 'Erro ao editar mensagem' }), { status: 502, headers })
}

return new Response(JSON.stringify({ success: true }), { status: 200, headers })
```

---

### `hub/supabase/functions/evolution-edit-message/index.ts` (novo)

**Proposito:** espelho do acima para a Evolution. Base: `evolution-send-message`.

**O que implementar:**
- Mesma moldura e as mesmas validacoes de `evolution_instances`.
- `POST /chat/updateMessage/{instance}` (confirmado no `chat.router.ts` da Evolution: a rota
  e POST, apesar de "update").
- `remoteJid` usa `@s.whatsapp.net` (nao `@c.us`, esse e o formato da WAHA).
- `fromMe: true` fixo: so editamos o que saiu da empresa.

**Snippet de referencia (miolo):**
```ts
const { instance_name, company_id: bodyCompanyId, to, message_id, text } = await req.json()
if (!to || !message_id || typeof text !== 'string' || !text.trim()) {
  return new Response(JSON.stringify({ success: false, error: 'to, message_id e text obrigatorios' }), { status: 400, headers })
}

// ... mesma resolucao de companyId/resolvedInstanceName e validacao de
// evolution_instances que existe em evolution-send-message ...

const config = await getEvolutionConfig(supabaseAdmin)
const formattedTo = to.replace(/\D/g, '')

const evoRes = await evolutionFetch(config.base_url, `/chat/updateMessage/${resolvedInstanceName}`, {
  method: 'POST',
  body: {
    number: formattedTo,
    key: { remoteJid: `${formattedTo}@s.whatsapp.net`, fromMe: true, id: message_id },
    text,
  },
})

if (!evoRes.ok) {
  console.error('Evolution edit error:', await evoRes.text())
  return new Response(JSON.stringify({ success: false, error: 'Erro ao editar mensagem' }), { status: 502, headers })
}

return new Response(JSON.stringify({ success: true }), { status: 200, headers })
```

---

### `supabase/functions/whatsapp-edit/index.ts` (novo, Veltzy)

**Proposito:** porta de entrada do frontend. Valida, chama o provider e so entao grava.

**Regra de ouro desta funcao:** se o provider falhar, **nao** atualiza a linha. O banco tem
que refletir o que esta no aparelho do lead. Editar so no banco cria uma mentira silenciosa.

**O que implementar:**
- CORS e OPTIONS via `getCorsHeaders` (padrao das outras).
- So JWT de usuario. Sem ramo service_role: nada interno edita mensagem.
- Resolve `company_id` pelo `profiles` (mesmo trecho do `whatsapp-send`).
- Busca a mensagem no schema `veltzy` e aplica os gates, cada um com erro proprio em pt-BR.
- Deriva provider: `message.whatsapp_provider ?? lead.whatsapp_provider ?? getActiveProvider(company)`.
- Deriva instancia: `message.instance_name ?? lead.whatsapp_instance_name`. Sem
  `resolveInstanceName` aqui: a edicao tem que sair pela **mesma** instancia do envio, e
  recalcular a cadeia poderia escolher outra.
- Update com `original_content = coalesce(original_content, <conteudo atual>)`.

**Snippet de referencia:**
```ts
const EDIT_WINDOW_MS = 15 * 60 * 1000 // limite do WhatsApp, nao nosso

interface EditPayload { messageId: string; content: string }

// ... auth e companyId iguais ao whatsapp-send ...

const payload: EditPayload = await req.json()
const content = (payload.content ?? '').trim()
if (!content) return bad(400, 'Mensagem vazia')

const { data: message } = await supabase
  .from('messages')
  .select('id, lead_id, company_id, content, external_id, sender_type, message_type, created_at, instance_name, whatsapp_provider, delivery_status')
  .eq('id', payload.messageId)
  .single()

if (!message || message.company_id !== companyId) return bad(404, 'Mensagem nao encontrada')
if (message.sender_type === 'lead') return bad(400, 'So da para editar mensagens que voce enviou')
if (message.message_type !== 'text') return bad(400, 'So da para editar mensagens de texto')
if (message.delivery_status === 'failed') return bad(400, 'Esta mensagem nao chegou a ser enviada')
if (!message.external_id) return bad(400, 'Esta mensagem foi enviada antes do suporte a edicao')
if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MS) {
  return bad(400, 'O WhatsApp so permite editar ate 15 minutos depois do envio')
}
if (content === message.content) return bad(400, 'O texto nao mudou')

const { data: lead } = await supabase
  .from('leads')
  .select('phone, whatsapp_instance_name, whatsapp_provider')
  .eq('id', message.lead_id)
  .single()

const provider = (message.whatsapp_provider ?? lead?.whatsapp_provider
  ?? await getActiveProvider(supabasePublic, companyId)) as WhatsAppProviderType

if (provider !== 'evolution' && provider !== 'waha') {
  return bad(400, 'O WhatsApp deste lead nao permite editar mensagens enviadas')
}

const instanceName = message.instance_name ?? lead?.whatsapp_instance_name
if (!instanceName) return bad(400, 'Nao foi possivel identificar o numero que enviou a mensagem')

// Falhou no provider: NAO grava. O banco tem que refletir o aparelho do lead.
try {
  await createProvider(provider).editMessage!({} as WhatsAppConfig, {
    phone: lead!.phone,
    externalId: message.external_id,
    content,
    companyId,
    ...(provider === 'waha' ? { sessionName: instanceName } : { instanceName }),
  })
} catch (err) {
  console.error('[whatsapp-edit] edit failed:', err)
  return bad(502, 'O WhatsApp recusou a edicao. A mensagem continua como estava.')
}

const { data: updated } = await supabase
  .from('messages')
  .update({
    content,
    edited_at: new Date().toISOString(),
    original_content: message.original_content ?? message.content,
  })
  .eq('id', message.id)
  .eq('company_id', companyId)
  .select()
  .single()

return new Response(JSON.stringify(updated), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
```

> `original_content` precisa entrar no `.select()` da busca da mensagem para o
> `?? message.content` funcionar. Incluir na lista de colunas.

---

### `src/hooks/use-edit-message.ts` (novo)

**Proposito:** mutation da edicao. Espelha `use-delete-lead-messages.ts`.

**O que implementar:**
- `useMutation` chamando `messagesService.editMessage`.
- `onSuccess`: atualiza a mensagem no cache `['messages', leadId]` e invalida
  `['conversations']` (a previa da lista vem do ultimo texto).
- `onError`: `toast.error` com a mensagem vinda do backend, nao um texto generico. Os erros
  do `whatsapp-edit` ja sao frases prontas em pt-BR e sao a parte util para o vendedor.

**Snippet de referencia:**
```ts
export const useEditMessage = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      messagesService.editMessage(companyId!, messageId, content),
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(['messages', updated.lead_id], (old) =>
        (old ?? []).map((m) => (m.id === updated.id ? updated : m)),
      )
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      toast.success('Mensagem editada')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao editar mensagem')
    },
  })
}
```

---

### `src/components/inbox/message-edit-form.tsx` (novo)

**Proposito:** o textarea da edicao inline. Componente separado porque o
`message-bubble.tsx` ja esta perto do teto de ~200 linhas do CLAUDE.md.

**O que implementar:**
- Props: `initialContent`, `isPending`, `onCancel`, `onSubmit(content)`.
- `Textarea` do shadcn, autofocus, cursor no fim.
- Enter envia, Shift+Enter quebra linha, Esc cancela. Mesmo idioma do `chat-input.tsx`
  (conferir o handler de tecla la e repetir, nao inventar outro).
- Botao salvar desabilitado com texto vazio, igual ao original ou `isPending`.
- Tokens semanticos apenas (`bg-background`, `text-foreground`), nada de cor fixa.

---

## Arquivos a modificar

### `supabase/functions/_shared/whatsapp-provider.ts`

**O que mudar:**
- Novo `EditMessagePayload`.
- `editMessage` **opcional** na interface `WhatsAppProvider`. Opcional de proposito: Z-API e
  Cloud API nao implementam, e o `?` faz o compilador lembrar disso em vez de exigir um
  `throw` decorativo nos dois.

**Linhas aproximadas:** tipos junto de `SendMessagePayload` (linha ~16), metodo no fim da
interface `WhatsAppProvider` (linha 52).

```ts
export interface EditMessagePayload {
  phone: string
  /** id da mensagem no provider (messages.external_id). */
  externalId: string
  /** novo texto. */
  content: string
  instanceName?: string   // Evolution
  sessionName?: string    // WAHA
  companyId?: string
}

// na interface WhatsAppProvider:
  /** So Evolution e WAHA. Cloud API e Z-API nao expoem edicao, por isso opcional. */
  editMessage?(config: WhatsAppConfig, payload: EditMessagePayload): Promise<void>
```

### `supabase/functions/_shared/providers/waha-hub.ts`

**O que mudar:**
- Implementar `editMessage` chamando `waha-edit-message` pelo `callHub` que ja existe.

```ts
async editMessage(_config: WhatsAppConfig, payload: EditMessagePayload): Promise<void> {
  if (!payload.sessionName) throw new Error('session_name obrigatorio para WAHA provider')
  await this.callHub('waha-edit-message', {
    session_name: payload.sessionName,
    company_id: payload.companyId ?? _config.company_id,
    to: payload.phone,
    message_id: payload.externalId,
    text: payload.content,
  })
}
```

### `supabase/functions/_shared/providers/evolution-hub.ts`

**O que mudar:**
1. `editMessage` analogo, chamando `evolution-edit-message` com `instance_name`.
2. **Corrigir o `sendMessage` para devolver o id.** Hoje faz `await this.callHub(...)` e
   `return {}`, jogando fora o `message_id` que o Hub ja manda
   (`hub/supabase/functions/evolution-send-message/index.ts`, no final: `message_id: evoData.key?.id`).
   Sem isso nao ha o que editar em lead Evolution.

```ts
const result = await this.callHub('evolution-send-message', { /* ...igual... */ })
  as { message_id?: string } | null
return result?.message_id ? { externalId: result.message_id } : {}
```

### `supabase/functions/whatsapp-send/index.ts`

**O que mudar:**
1. No ramo `evolution | waha`, **capturar o retorno** do `provider.sendMessage`. Hoje a
   chamada e `await provider.sendMessage({...})` sem atribuicao, e o id se perde.
2. Gravar `whatsapp_provider: activeProvider` no insert da mensagem. A coluna existe desde a
   073 e nunca foi preenchida; e ela que deixa o `whatsapp-edit` editar pelo provider que de
   fato enviou, mesmo que o lead tenha mudado de provider depois.

**Linhas aproximadas:** ramo Evolution/WAHA por volta da linha 166, insert por volta da 238.

```ts
// no ramo evolution/waha:
const provider = createProvider(activeProvider)
const result = await provider.sendMessage({} as WhatsAppConfig, { /* ...igual... */ })
externalId = result.externalId ?? null

// no insert:
  external_id: externalId,
  whatsapp_provider: activeProvider,
```

> Atencao ao indice unico `(company_id, external_id)`: passar a gravar o id do outbound so e
> seguro porque os webhooks do Hub descartam `fromMe`. Nao mexer nesse filtro.

### `src/types/database.ts`

**O que mudar:** duas colunas novas na interface `Message` (linha 370), depois de
`delivery_error`:

```ts
  edited_at: string | null
  original_content: string | null
```

E acrescentar os dois campos ao objeto `optimisticMessage` do `use-messages.ts` (`edited_at: null`,
`original_content: null`), senao o `tsc -b` quebra la.

### `src/services/messages.service.ts`

**O que mudar:** funcao `editMessage`, logo abaixo de `deleteLeadMessages` (linha 58). Chama a
edge function, nunca a tabela: nao existe policy de UPDATE em `veltzy.messages` para
`authenticated`, um `.update()` daqui passaria sem erro e mudaria zero linhas.

```ts
/**
 * Edita o texto de uma mensagem ja enviada, no WhatsApp E no banco.
 *
 * Passa pela edge function de proposito: veltzy.messages nao tem policy de
 * UPDATE para authenticated, entao um .update() daqui apagaria zero linhas
 * calado. E so a edge function tem a chave do Hub para falar com o provider.
 */
export const editMessage = async (
  companyId: string,
  messageId: string,
  content: string,
): Promise<Message> => {
  const { data, error } = await supabase.functions.invoke('whatsapp-edit', {
    body: { messageId, content, companyId },
  })
  if (error) {
    // O corpo do erro traz a frase util ("passou de 15 minutos", etc).
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? 'Erro ao editar mensagem')
  }
  return data as Message
}
```

### `src/components/inbox/message-bubble.tsx`

**O que mudar:**
1. Helper exportado com a regra de quando a acao aparece (e testavel sem UI):

```ts
const EDIT_WINDOW_MS = 15 * 60 * 1000

export const canEditMessage = (message: Message): boolean =>
  message.sender_type !== 'lead' &&
  message.message_type === 'text' &&
  message.delivery_status !== 'failed' &&
  !!message.external_id &&
  !message.id.startsWith('optimistic-') &&
  Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS
```

2. Estado local `isEditing`. Quando ligado, troca o `<p>` do conteudo pelo
   `MessageEditForm`. O resto da bolha (nome, hora, status) continua igual.
3. Botao `Pencil` (lucide, 3.5) revelado no hover da bolha, so se `canEditMessage(message)`.
   Usar o padrao `group`/`group-hover:opacity-100` que o `conversation-item.tsx` ja usa.
4. Marca "editada" ao lado da hora quando `message.edited_at`, no mesmo `<p>` do `timeAgo`:

```tsx
{message.edited_at && <span className="italic opacity-70">editada</span>}
```

**Cuidado com o teto de linhas:** o arquivo ja tem ~190 linhas. Se passar de 200, extrair os
subcomponentes de midia (`MediaContent` e amigos) para `message-media.tsx` em vez de encolher
o que a Spec pede.

> A janela de 15 minutos e checada no render, entao uma bolha aberta ha tempo pode mostrar o
> lapis depois de expirado ate o proximo re-render. Nao resolver com timer: o gate da UI e
> conveniencia, a verdade e o `whatsapp-edit`, que devolve a frase certa. Se incomodar em
> uso real, a onda 2 resolve.

---

## Arquivos a NAO tocar

- `supabase/functions/zapi-send/`, `supabase/functions/_shared/providers/zapi.ts` e
  `providers/cloud-api.ts`: os dois providers nao editam. Nao implementar `editMessage`
  neles nem com `throw`, o `?` na interface ja cobre.
- `supabase/functions/_shared/resolve-instance.ts`: a edicao usa a instancia gravada no
  envio, nao a cadeia de resolucao. Mexer aqui pode mudar o roteamento do envio.
- `src/services/messages.service.ts` funcao `deleteLeadMessages`: nao transformar em delete
  no WhatsApp de carona. E outra onda, com outra confirmacao de UI.
- `src/hooks/use-messages.ts` handler de `UPDATE` do realtime: ele **ja** propaga a edicao
  para os outros usuarios com a conversa aberta. Nao precisa de canal novo.
- Policies de `veltzy.messages`: nao criar policy de UPDATE para `authenticated`.
- `supabase/migrations/` do Veltzy: a migration vai no Hub.

## Ordem de implementacao

1. **Migration no Hub** e aplicar no staging. Tudo que vem depois referencia as colunas.
2. **`whatsapp-send` + os dois providers do Veltzy** (captura do `external_id` e
   `whatsapp_provider`). Deploy cedo e proposital: so mensagens enviadas depois disso
   poderao ser editadas, entao quanto antes, menos mensagem "nao editavel" no teste.
3. **Funcoes do Hub** (`waha-edit-message`, `evolution-edit-message`), com deploy.
4. **`whatsapp-edit`** no Veltzy. Depende de 2 e 3.
5. **Tipos, service, hook.**
6. **UI** (`message-edit-form.tsx` e `message-bubble.tsx`). Por ultimo: so faz sentido testar
   na tela quando o caminho todo existe.

## Criterios de pronto

Evidencias obrigatorias do PVO, as quatro:

- [ ] `npx tsc -b` limpo (nao `tsc --noEmit`, que neste tsconfig solution-style nao checa nada).
- [ ] `npm run build` limpo.
- [ ] `npm run lint` limpo, inclusive nas edge functions (o lint passa em `supabase/functions`,
      o `tsc -b` nao).
- [ ] `npx --yes deno check supabase/functions/waha-edit-message/index.ts` e o mesmo para
      `evolution-edit-message`, rodados **dentro do repo do Hub** (o `tsc -b` do Hub nao cobre
      `supabase/functions`, e o deno nao esta instalado, so via npx).
- [ ] `git diff` revisado pela Leticia antes de qualquer commit.

Verificacao em aparelho real (nao vale emulador, nao vale "deduzi que funciona"):

- [ ] Enviar uma mensagem de texto pela inbox para um numero de teste em sessao **WAHA**, editar
      dentro de 1 minuto, e **o texto muda no WhatsApp do aparelho**, com a marca "Editada" do
      proprio WhatsApp.
- [ ] Mesmo teste em lead **Evolution**, se houver instancia conectada. Se nao houver, registrar
      no PR que o ramo Evolution ficou sem teste em aparelho, nao marcar como verificado.
- [ ] A bolha mostra "editada" e o texto novo sem F5, e em uma **segunda aba** a mensagem tambem
      muda sozinha (realtime de UPDATE).
- [ ] `SELECT id, content, original_content, edited_at FROM veltzy.messages WHERE id = '<id>'`
      mostra o texto novo em `content` e o antigo em `original_content` (SELECT rodado pela Leticia).
- [ ] Editar de novo a mesma mensagem: `original_content` **nao muda** (continua o primeiro texto).
- [ ] Mensagem com mais de 15 minutos nao mostra o lapis; forcando a chamada, o backend devolve
      "O WhatsApp so permite editar ate 15 minutos depois do envio" e o texto no banco **nao muda**.
- [ ] Lead de provider Cloud API ou Z-API nao mostra o lapis.
- [ ] Mensagem recebida do lead nao mostra o lapis.
- [ ] Com a sessao derrubada no Hub, a edicao falha com aviso visivel e o `content` no banco
      continua o antigo (a falha e barulhenta, nao silenciosa).

## Riscos e armadilhas

- **Mensagens antigas nunca serao editaveis.** Sem `external_id` nao ha id no provider. A UI
  esconde o lapis nelas; nao tentar "adivinhar" o id.
- **O shape da resposta do send da WAHA nao esta 100% confirmado.** O proprio
  `waha-send-message` diz isso e extrai o id defensivamente
  (`wahaData?.id?._serialized ?? wahaData?.id ?? ...`). O id serializado da WAHA tem a forma
  `true_5511...@c.us_AAA` e e **esse** valor inteiro que o PUT precisa no path. Conferir no
  primeiro envio real que o `external_id` gravado tem esse formato; se vier so o sufixo, o
  edit vai dar 404 na WAHA.
- **Evolution nao edita legenda de midia** (TODO aberto no proprio projeto). O gate de
  `message_type === 'text'` ja cobre, mas nao afrouxar depois sem testar.
- **A janela de 15 minutos e do WhatsApp**, contada do envio. Fora dela a API pode ate aceitar
  a chamada e o aparelho ignorar: por isso o criterio de pronto exige olhar o aparelho, e nao
  o status HTTP.
