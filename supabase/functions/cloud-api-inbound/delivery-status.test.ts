import { assertEquals } from 'jsr:@std/assert@1'
import { mapStatus, shouldApply } from './delivery-status.ts'

Deno.test('mapStatus normaliza e rejeita desconhecidos', () => {
  assertEquals(mapStatus('sent'), 'sent')
  assertEquals(mapStatus('DELIVERED'), 'delivered')
  assertEquals(mapStatus('read'), 'read')
  assertEquals(mapStatus('failed'), 'failed')
  assertEquals(mapStatus('deleted'), '')
  assertEquals(mapStatus(null), '')
  assertEquals(mapStatus(undefined), '')
})

Deno.test('progressão normal avança sent→delivered→read', () => {
  assertEquals(shouldApply('sent', 'delivered'), true)
  assertEquals(shouldApply('delivered', 'read'), true)
  assertEquals(shouldApply('pending', 'sent'), true)
  assertEquals(shouldApply(null, 'delivered'), true) // nulo = pending
})

Deno.test('não regride', () => {
  assertEquals(shouldApply('read', 'delivered'), false)
  assertEquals(shouldApply('read', 'sent'), false)
  assertEquals(shouldApply('delivered', 'sent'), false)
  assertEquals(shouldApply('delivered', 'delivered'), false)
})

Deno.test('sent→failed APLICA (caso real da Meta: aceita e depois indeliverável)', () => {
  assertEquals(shouldApply('sent', 'failed'), true)
  assertEquals(shouldApply('pending', 'failed'), true)
})

Deno.test('failed NÃO sobrescreve delivered/read', () => {
  assertEquals(shouldApply('delivered', 'failed'), false)
  assertEquals(shouldApply('read', 'failed'), false)
})
