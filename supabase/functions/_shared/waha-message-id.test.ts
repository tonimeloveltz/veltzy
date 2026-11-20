import { assertEquals } from 'jsr:@std/assert@1'
import { normalizeWahaMessageId } from './waha-message-id.ts'

Deno.test('id cru do receiver fica igual', () => {
  assertEquals(normalizeWahaMessageId('2A2220A84D1C32411DE0'), '2A2220A84D1C32411DE0')
})

Deno.test('id serializado vira o sufixo', () => {
  assertEquals(normalizeWahaMessageId('true_5511999999999@c.us_3EB0ABC123'), '3EB0ABC123')
  assertEquals(normalizeWahaMessageId('false_22248366825566@lid_2A2220A84D1C32411DE0'), '2A2220A84D1C32411DE0')
})

Deno.test('vazio/nulo vira null', () => {
  assertEquals(normalizeWahaMessageId(null), null)
  assertEquals(normalizeWahaMessageId(undefined), null)
  assertEquals(normalizeWahaMessageId('  '), null)
  assertEquals(normalizeWahaMessageId('true_x_'), null)
})
