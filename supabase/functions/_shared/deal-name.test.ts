import { assertEquals } from 'jsr:@std/assert@1'
import { buildDealName } from './deal-name.ts'

Deno.test('buildDealName: usa o nome do contato', () => {
  assertEquals(buildDealName('Felippi Crevellari'), 'Negocio - Felippi Crevellari')
})

Deno.test('buildDealName: fallback (nome/phone) quando presente', () => {
  assertEquals(buildDealName('+5511999998888'), 'Negocio - +5511999998888')
})

Deno.test('buildDealName: vazio/espaços/nulo → "Negocio"', () => {
  assertEquals(buildDealName(''), 'Negocio')
  assertEquals(buildDealName('   '), 'Negocio')
  assertEquals(buildDealName(null), 'Negocio')
  assertEquals(buildDealName(undefined), 'Negocio')
})

Deno.test('buildDealName: NUNCA embute nome de pipeline (regressão do rótulo velho)', () => {
  // Antes: `Negocio - ${pipeline.name}` congelava "Pipeline Principal". Agora só contato.
  assertEquals(buildDealName('Teste 2').includes('Pipeline'), false)
})
