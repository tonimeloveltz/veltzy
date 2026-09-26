import { assertEquals } from 'jsr:@std/assert@1'
import { decideAutomationSend, isNonOfficialProvider } from './webhook-welcome-instance.ts'

Deno.test('isNonOfficialProvider: waha/evolution sim; zapi/cloud_api nao', () => {
  assertEquals(isNonOfficialProvider('waha'), true)
  assertEquals(isNonOfficialProvider('evolution'), true)
  assertEquals(isNonOfficialProvider('zapi'), false)
  assertEquals(isNonOfficialProvider('cloud_api'), false)
  assertEquals(isNonOfficialProvider(null), false)
})

Deno.test('waha: sem número em lugar nenhum → BLOQUEIA (failed explícito)', () => {
  const d = decideAutomationSend({ provider: 'waha', leadInstanceName: null, sourceSendInstance: null })
  assertEquals(d.blocked, true)
  assertEquals(d.instanceName, null)
  assertEquals(typeof d.reason, 'string')
})

Deno.test('waha: número da ORIGEM (config.send_instance) → usa, não bloqueia', () => {
  const d = decideAutomationSend({ provider: 'waha', leadInstanceName: null, sourceSendInstance: 'elite-waha-1' })
  assertEquals(d, { instanceName: 'elite-waha-1', blocked: false, reason: null })
})

Deno.test('waha: instância do LEAD tem prioridade sobre a origem', () => {
  const d = decideAutomationSend({ provider: 'waha', leadInstanceName: 'lead-inst', sourceSendInstance: 'origem-inst' })
  assertEquals(d.instanceName, 'lead-inst')
  assertEquals(d.blocked, false)
})

Deno.test('evolution: sem número → BLOQUEIA', () => {
  assertEquals(decideAutomationSend({ provider: 'evolution', leadInstanceName: null, sourceSendInstance: null }).blocked, true)
})

Deno.test('zapi: sem número → NÃO bloqueia (resolve por company no consumidor)', () => {
  const d = decideAutomationSend({ provider: 'zapi', leadInstanceName: null, sourceSendInstance: null })
  assertEquals(d, { instanceName: null, blocked: false, reason: null })
})

Deno.test('cloud_api: sem número → NÃO bloqueia (número default da empresa)', () => {
  assertEquals(decideAutomationSend({ provider: 'cloud_api', leadInstanceName: null, sourceSendInstance: null }).blocked, false)
})

Deno.test('string vazia/espaços = sem número (waha bloqueia)', () => {
  const d = decideAutomationSend({ provider: 'waha', leadInstanceName: '  ', sourceSendInstance: '' })
  assertEquals(d.blocked, true)
})
