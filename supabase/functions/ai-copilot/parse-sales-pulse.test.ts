import { assertEquals } from 'jsr:@std/assert@1'
import { parseSalesPulse } from './parse-sales-pulse.ts'

const VALID = JSON.stringify({
  situacao: 'Leticia possui 36 leads cold.',
  alertas: [{ tipo: 'urgente', texto: 'Deal parado', lead_id: null }],
  acoes: [{ texto: 'Revisar deal', lead_id: null, destino: 'deals' }],
})

Deno.test('parseSalesPulse: JSON valido passa inteiro', () => {
  const r = parseSalesPulse(VALID)
  assertEquals(r?.situacao, 'Leticia possui 36 leads cold.')
  assertEquals(r?.alertas.length, 1)
  assertEquals(r?.acoes.length, 1)
})

Deno.test('parseSalesPulse: JSON cortado por max_tokens -> null (caso de producao 29/09)', () => {
  // Termina no meio do array de acoes, sem `]}`: exatamente o que o card exibia cru.
  const cut = '{ "situacao": "Leticia possui 36 leads cold.", "alertas": [], "acoes": [ { "texto": "Enviar follow-up", "destino": "inbox" }'
  assertEquals(parseSalesPulse(cut), null)
})

Deno.test('parseSalesPulse: JSON dentro de cerca ```json e aceito', () => {
  assertEquals(parseSalesPulse('```json\n' + VALID + '\n```')?.situacao, 'Leticia possui 36 leads cold.')
  assertEquals(parseSalesPulse('```\n' + VALID + '\n```')?.situacao, 'Leticia possui 36 leads cold.')
})

Deno.test('parseSalesPulse: vazio, texto solto ou sem situacao -> null', () => {
  assertEquals(parseSalesPulse(null), null)
  assertEquals(parseSalesPulse(''), null)
  assertEquals(parseSalesPulse('{}'), null)
  assertEquals(parseSalesPulse('Nao consegui analisar os dados.'), null)
  assertEquals(parseSalesPulse('{"situacao": "   "}'), null)
  assertEquals(parseSalesPulse('[]'), null)
})

Deno.test('parseSalesPulse: alertas/acoes ausentes ou fora de formato viram []', () => {
  const r = parseSalesPulse('{"situacao": "ok", "alertas": "nenhum"}')
  assertEquals(r, { situacao: 'ok', alertas: [], acoes: [] })
})
