import { assertEquals } from 'jsr:@std/assert@1'
import { decideTranscriptionUpdate } from './lead-inbound-handler.ts'

Deno.test('decideTranscriptionUpdate: ok com texto -> aplica', () => {
  const d = decideTranscriptionUpdate(200, { ok: true, data: { text: 'ola mundo' } })
  assertEquals(d, { apply: true, text: 'ola mundo' })
})

Deno.test('decideTranscriptionUpdate: 403 sem acesso -> pula silencioso', () => {
  const d = decideTranscriptionUpdate(403, { ok: false, error: { code: 'TENANT_DISABLED' } })
  assertEquals(d.apply, false)
  if (!d.apply) assertEquals(d.reason, 'no_access_403')
})

Deno.test('decideTranscriptionUpdate: ok:false (200) -> pula', () => {
  const d = decideTranscriptionUpdate(200, { ok: false, error: { code: 'PROVIDER_ERROR' } })
  assertEquals(d.apply, false)
  if (!d.apply) assertEquals(d.reason, 'gateway_not_ok')
})

Deno.test('decideTranscriptionUpdate: corpo ausente -> pula', () => {
  const d = decideTranscriptionUpdate(200, null)
  assertEquals(d.apply, false)
  if (!d.apply) assertEquals(d.reason, 'gateway_not_ok')
})

Deno.test('decideTranscriptionUpdate: ok:true mas texto vazio/espacos -> pula', () => {
  assertEquals(decideTranscriptionUpdate(200, { ok: true, data: { text: '' } }).apply, false)
  assertEquals(decideTranscriptionUpdate(200, { ok: true, data: { text: '   ' } }).apply, false)
  assertEquals(decideTranscriptionUpdate(200, { ok: true, data: {} }).apply, false)
})

Deno.test('decideTranscriptionUpdate: texto com espacos ao redor -> aplica preservando o valor', () => {
  const d = decideTranscriptionUpdate(200, { ok: true, data: { text: '  audio transcrito  ' } })
  assertEquals(d, { apply: true, text: '  audio transcrito  ' })
})
