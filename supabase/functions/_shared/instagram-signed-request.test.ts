import { assertEquals } from 'jsr:@std/assert@1'
import { base64UrlEncode, hmacSha256 } from './instagram-hmac.ts'
import { parseSignedRequest } from './instagram-signed-request.ts'

const APP_SECRET = 'app-secret-de-teste'

const build = async (payload: Record<string, unknown>, secret = APP_SECRET): Promise<string> => {
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = base64UrlEncode(await hmacSha256(secret, encoded))
  return `${signature}.${encoded}`
}

Deno.test('signed_request: valido devolve user_id', async () => {
  const sr = await build({ algorithm: 'HMAC-SHA256', issued_at: 1757851200, user_id: '17841400000000001' })
  const parsed = await parseSignedRequest(sr, APP_SECRET)
  assertEquals(parsed?.user_id, '17841400000000001')
  assertEquals(parsed?.issued_at, 1757851200)
})

Deno.test('signed_request: user_id numerico vira string', async () => {
  const sr = await build({ algorithm: 'HMAC-SHA256', user_id: 12345 })
  assertEquals((await parseSignedRequest(sr, APP_SECRET))?.user_id, '12345')
})

Deno.test('signed_request: assinatura com outro segredo -> null', async () => {
  const sr = await build({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'outro-segredo')
  assertEquals(await parseSignedRequest(sr, APP_SECRET), null)
})

Deno.test('signed_request: payload trocado depois de assinado -> null', async () => {
  const sr = await build({ algorithm: 'HMAC-SHA256', user_id: '1' })
  const [signature] = sr.split('.')
  const other = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '2' })))
  assertEquals(await parseSignedRequest(`${signature}.${other}`, APP_SECRET), null)
})

Deno.test('signed_request: algoritmo errado -> null', async () => {
  const sr = await build({ algorithm: 'HMAC-SHA1', user_id: '1' })
  assertEquals(await parseSignedRequest(sr, APP_SECRET), null)
})

Deno.test('signed_request: sem user_id ou formato invalido -> null', async () => {
  assertEquals(await parseSignedRequest(await build({ algorithm: 'HMAC-SHA256' }), APP_SECRET), null)
  assertEquals(await parseSignedRequest('', APP_SECRET), null)
  assertEquals(await parseSignedRequest('so-um-trecho', APP_SECRET), null)
  assertEquals(await parseSignedRequest(await build({ algorithm: 'HMAC-SHA256', user_id: '1' }), ''), null)
})
