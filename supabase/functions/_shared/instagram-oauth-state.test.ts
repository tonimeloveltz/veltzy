import { assertEquals } from 'jsr:@std/assert@1'
import { OAUTH_STATE_TTL_MS, signState, verifyState, type StatePayload } from './instagram-oauth-state.ts'

const SECRET = 'segredo-de-teste-com-32-bytes-ou-mais!!'
const NOW = new Date('2026-09-14T12:00:00Z')

const payload = (): StatePayload => ({
  companyId: 'c-1',
  userId: 'u-1',
  nonce: 'n-1',
  exp: NOW.getTime() + OAUTH_STATE_TTL_MS,
})

Deno.test('state: roundtrip devolve o payload', async () => {
  const state = await signState(payload(), SECRET)
  assertEquals(await verifyState(state, SECRET, NOW), payload())
})

Deno.test('state: payload adulterado -> null', async () => {
  const state = await signState(payload(), SECRET)
  const [, sig] = state.split('.')
  const forged = btoa(JSON.stringify({ ...payload(), companyId: 'c-2' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assertEquals(await verifyState(`${forged}.${sig}`, SECRET, NOW), null)
})

Deno.test('state: assinatura adulterada -> null', async () => {
  const state = await signState(payload(), SECRET)
  const [body, sig] = state.split('.')
  const tampered = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
  assertEquals(await verifyState(`${body}.${tampered}`, SECRET, NOW), null)
})

Deno.test('state: segredo diferente -> null', async () => {
  const state = await signState(payload(), SECRET)
  assertEquals(await verifyState(state, 'outro-segredo', NOW), null)
})

Deno.test('state: expirado -> null', async () => {
  const state = await signState(payload(), SECRET)
  const later = new Date(NOW.getTime() + OAUTH_STATE_TTL_MS + 1)
  assertEquals(await verifyState(state, SECRET, later), null)
})

Deno.test('state: formato invalido -> null', async () => {
  assertEquals(await verifyState('', SECRET, NOW), null)
  assertEquals(await verifyState('sem-ponto', SECRET, NOW), null)
  assertEquals(await verifyState('a.b.c', SECRET, NOW), null)
  assertEquals(await verifyState('!!!.abc', SECRET, NOW), null)
})
