import { assertEquals } from 'jsr:@std/assert@1'
import {
  graphRequest,
  INSTAGRAM_GRAPH_BASE,
  isTokenInvalid,
  parseGraphError,
  parseJsonKeepingBigIds,
} from './instagram-graph.ts'

const withFetch = async (
  impl: (url: string, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) => {
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    impl(input instanceof Request ? input.url : String(input), init)) as typeof fetch
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
}

Deno.test('parseGraphError: formato graph { error: { code, message } }', () => {
  const e = parseGraphError(400, { error: { code: 190, message: 'Error validating access token' } })
  assertEquals(e, { status: 400, code: 190, message: 'Error validating access token' })
})

Deno.test('parseGraphError: formato oauth { error_type, code, error_message }', () => {
  const e = parseGraphError(400, { error_type: 'OAuthException', code: 400, error_message: 'Invalid platform app' })
  assertEquals(e, { status: 400, code: 400, message: 'Invalid platform app' })
})

Deno.test('parseGraphError: corpo ausente cai no HTTP status', () => {
  assertEquals(parseGraphError(502, null), { status: 502, code: null, message: 'HTTP 502' })
})

Deno.test('isTokenInvalid: so code 190', () => {
  assertEquals(isTokenInvalid({ status: 400, code: 190, message: '' }), true)
  assertEquals(isTokenInvalid({ status: 400, code: 10, message: '' }), false)
  assertEquals(isTokenInvalid({ status: 0, code: null, message: '' }), false)
})

Deno.test('parseJsonKeepingBigIds: id numerico grande vira string sem perder digito', () => {
  const parsed = parseJsonKeepingBigIds('{"access_token":"x","user_id":17841400123456789,"n":42}') as Record<string, unknown>
  assertEquals(parsed.user_id, '17841400123456789')
  assertEquals(parsed.n, 42)
})

Deno.test('parseJsonKeepingBigIds: numero dentro de string nao e tocado', () => {
  const parsed = parseJsonKeepingBigIds('{"text":"pedido 12345678901234567, ok"}') as Record<string, unknown>
  assertEquals(parsed.text, 'pedido 12345678901234567, ok')
})

Deno.test('graphRequest: token no header, nunca na URL', async () => {
  let seenUrl = ''
  let seenAuth: string | null = null
  await withFetch(async (url, init) => {
    seenUrl = url
    seenAuth = new Headers(init?.headers).get('Authorization')
    return new Response(JSON.stringify({ user_id: '1', username: 'loja' }), { status: 200 })
  }, async () => {
    const r = await graphRequest<{ username: string }>('/me', { token: 'tok-secreto', query: { fields: 'user_id,username' } })
    assertEquals(r.ok, true)
    if (r.ok) assertEquals(r.data.username, 'loja')
  })
  assertEquals(seenUrl.startsWith(`${INSTAGRAM_GRAPH_BASE}/me?`), true)
  assertEquals(seenUrl.includes('tok-secreto'), false)
  assertEquals(seenAuth, 'Bearer tok-secreto')
})

Deno.test('graphRequest: erro da Meta vira ok:false com code', async () => {
  await withFetch(async () =>
    new Response(JSON.stringify({ error: { code: 190, message: 'expired' } }), { status: 400 }), async () => {
    const r = await graphRequest('/me', { token: 't' })
    assertEquals(r.ok, false)
    if (!r.ok) assertEquals(r.error.code, 190)
  })
})

Deno.test('graphRequest: falha de rede nao vaza a URL com segredo', async () => {
  await withFetch(async (url) => {
    throw new TypeError(`error sending request for url (${url})`)
  }, async () => {
    const r = await graphRequest('https://graph.instagram.com/access_token', { query: { client_secret: 'segredo' } })
    assertEquals(r.ok, false)
    if (!r.ok) assertEquals(r.error.message.includes('segredo'), false)
  })
})
