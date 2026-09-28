import { assertEquals } from 'jsr:@std/assert@1'
import { mapPayload } from './webhook-payload-mapper.ts'

// FB/IG Lead Ads (9 campos) via Make → preset meta_lead_ads.
const payload9 = {
  full_name: 'Felippi Crevellari',
  phone_number: '+5511999998888',
  email: 'felippi@empresa.com',
  instagram: '@felippi',
  company: 'Empresa X',
  faturamento: 'R$ 3-10M',
  papel: 'Dono',
  funcionarios: '6-20',
  gargalo: 'Vendas nao escalam',
  tags: ['Maluf'],
}

Deno.test('meta_lead_ads: contato → colunas (name/email/instagram/company)', () => {
  const m = mapPayload('meta_lead_ads', payload9)
  assertEquals(m.name, 'Felippi Crevellari')
  assertEquals(m.email, 'felippi@empresa.com')
  assertEquals(m.phone, '+5511999998888')
  assertEquals(m.instagram, '@felippi')
  assertEquals(m.company, 'Empresa X')
})

Deno.test('meta_lead_ads: qualificações viram TAGS estruturadas + expert', () => {
  const m = mapPayload('meta_lead_ads', payload9)
  assertEquals(m.tags.includes('Maluf'), true)
  assertEquals(m.tags.includes('Fat: R$ 3-10M'), true)
  assertEquals(m.tags.includes('Papel: Dono'), true)
  assertEquals(m.tags.includes('Func: 6-20'), true)
  assertEquals(m.tags.includes('Gargalo: Vendas nao escalam'), true)
})

Deno.test('meta_lead_ads: observations tem o texto das qualificações; contato NÃO duplica', () => {
  const m = mapPayload('meta_lead_ads', payload9)
  const obs = m.observations ?? ''
  // qualificações aparecem no texto completo
  assertEquals(obs.includes('Vendas nao escalam') || obs.includes('gargalo'), true)
  // campos que viraram COLUNA estruturada não repetem em observations
  assertEquals(obs.includes('felippi@empresa.com'), false)
  assertEquals(obs.includes('Empresa X'), false)
})

Deno.test('meta_lead_ads: sem qualificações → só a base de tags, sem "Fat:" etc.', () => {
  const m = mapPayload('meta_lead_ads', { full_name: 'A', phone_number: '+551199999', tags: ['Rebeca'] })
  assertEquals(m.tags.includes('Rebeca'), true)
  assertEquals(m.tags.some((t) => t.startsWith('Fat:')), false)
  assertEquals(m.instagram ?? null, null)
})

Deno.test('meta_lead_ads: aceita aliases (instagram_handle/empresa)', () => {
  const m = mapPayload('meta_lead_ads', { phone_number: '+55119', instagram_handle: '@x', empresa: 'ACME' })
  assertEquals(m.instagram, '@x')
  assertEquals(m.company, 'ACME')
})
