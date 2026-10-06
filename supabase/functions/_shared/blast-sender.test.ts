import { assertEquals } from 'jsr:@std/assert@1'
import { resolveSenderInstance, splitAntiBan } from './blast-sender.ts'

Deno.test('splitAntiBan: null/nao-objeto = tudo vazio', () => {
  assertEquals(splitAntiBan(null), { throttle: null, sender: null, force: false })
  assertEquals(splitAntiBan('x'), { throttle: null, sender: null, force: false })
})

Deno.test('splitAntiBan: separa throttle das chaves de envio', () => {
  assertEquals(
    splitAntiBan({ delay_min: 10, daily_cap: 20, sender_instance: 'sessao-a', sender_force: true }),
    { throttle: { delay_min: 10, daily_cap: 20 }, sender: 'sessao-a', force: true },
  )
})

Deno.test('splitAntiBan: so chaves de envio = throttle null (defaults do servidor)', () => {
  assertEquals(splitAntiBan({ sender_instance: 'sessao-a' }), { throttle: null, sender: 'sessao-a', force: false })
})

Deno.test('splitAntiBan: force sem sender nao vale; sender vazio vira null', () => {
  assertEquals(splitAntiBan({ sender_instance: '  ', sender_force: true }), { throttle: null, sender: null, force: false })
})

Deno.test('resolveSenderInstance: lead mantem o numero dele', () => {
  assertEquals(resolveSenderInstance('lead-num', 'escolhido', false), 'lead-num')
})

Deno.test('resolveSenderInstance: lead sem numero usa o escolhido', () => {
  assertEquals(resolveSenderInstance(null, 'escolhido', false), 'escolhido')
  assertEquals(resolveSenderInstance('', 'escolhido', false), 'escolhido')
})

Deno.test('resolveSenderInstance: force manda todos pelo escolhido', () => {
  assertEquals(resolveSenderInstance('lead-num', 'escolhido', true), 'escolhido')
})

Deno.test('resolveSenderInstance: sem escolhido = comportamento antigo', () => {
  assertEquals(resolveSenderInstance('lead-num', null, false), 'lead-num')
  assertEquals(resolveSenderInstance(null, null, false), null)
})
