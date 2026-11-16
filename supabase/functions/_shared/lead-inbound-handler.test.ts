import { assertEquals } from 'jsr:@std/assert@1'
import { buildLeadCadastroInsert, decideTranscriptionUpdate, revokeMarketingConsents } from './lead-inbound-handler.ts'

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

Deno.test('buildLeadCadastroInsert: inbound sem tags (WhatsApp) -> tags [] (leads.tags e NOT NULL)', () => {
  const c = buildLeadCadastroInsert({})
  assertEquals(c, { email: null, instagram_handle: null, company_name: null, tags: [] })
})

Deno.test('buildLeadCadastroInsert: tags vazias -> [] (nunca null)', () => {
  assertEquals(buildLeadCadastroInsert({ tags: [] }).tags, [])
})

Deno.test('buildLeadCadastroInsert: cadastro do webhook preserva campos e tags', () => {
  const c = buildLeadCadastroInsert({ email: 'a@b.com', instagram: '@x', company: 'ACME', tags: ['form'] })
  assertEquals(c, { email: 'a@b.com', instagram_handle: '@x', company_name: 'ACME', tags: ['form'] })
})

// Fake minimo do query builder: registra a cadeia de chamadas.
function fakeClient(result: { error: { message: string } | null } = { error: null }) {
  const calls: Array<[string, unknown[]]> = []
  const builder: Record<string, unknown> = {}
  for (const m of ['update', 'eq', 'is']) {
    builder[m] = (...args: unknown[]) => { calls.push([m, args]); return builder }
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  const client = { from: (table: string) => { calls.push(['from', [table]]); return builder } }
  return { client, calls }
}

Deno.test('revokeMarketingConsents: carimba revogado_em so nos de marketing ativos do contato', async () => {
  const { client, calls } = fakeClient()
  await revokeMarketingConsents(client as unknown as Parameters<typeof revokeMarketingConsents>[0], 'co1', 'lead1')
  assertEquals(calls[0], ['from', ['lead_consents']])
  assertEquals(calls[1][0], 'update')
  const patch = calls[1][1][0] as Record<string, unknown>
  assertEquals(Object.keys(patch), ['revogado_em'])
  assertEquals(typeof patch.revogado_em, 'string')
  assertEquals(calls.slice(2), [
    ['eq', ['company_id', 'co1']],
    ['eq', ['lead_id', 'lead1']],
    ['eq', ['finalidade', 'marketing_whatsapp']],
    ['is', ['revogado_em', null]],
  ])
})

Deno.test('revokeMarketingConsents: erro do banco nao lanca', async () => {
  const { client } = fakeClient({ error: { message: 'boom' } })
  await revokeMarketingConsents(client as unknown as Parameters<typeof revokeMarketingConsents>[0], 'co1', 'lead1')
})
