import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { clientIp, hashIp } from './ip-hash.ts'

Deno.test('clientIp: x-forwarded-for primeiro, depois cf-connecting-ip, depois unknown', () => {
  assertEquals(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1', 'cf-connecting-ip': '9.9.9.9' })), '1.2.3.4')
  assertEquals(clientIp(new Headers({ 'cf-connecting-ip': '9.9.9.9' })), '9.9.9.9')
  assertEquals(clientIp(new Headers()), 'unknown')
})

Deno.test('hashIp: sha256 hex, deterministico e dependente do sal', async () => {
  const a = await hashIp('1.2.3.4', 'sal')
  assertEquals(a.length, 64)
  assertEquals(a, await hashIp('1.2.3.4', 'sal'))
  assertNotEquals(a, await hashIp('1.2.3.4', 'outro'))
})
