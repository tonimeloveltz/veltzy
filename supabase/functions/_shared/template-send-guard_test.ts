import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { countBodyVars, validateTemplateRow } from './template-send-guard.ts'

const bodyWith = (text: string) => [{ type: 'HEADER', text: 'h' }, { type: 'BODY', text }]

Deno.test('countBodyVars conta {{n}} unicos do BODY', () => {
  assertEquals(countBodyVars(bodyWith('Ola {{1}}, pedido {{2}}')), 2)
  assertEquals(countBodyVars(bodyWith('{{1}} e {{1}} de novo')), 1)
  assertEquals(countBodyVars(bodyWith('sem variavel')), 0)
  assertEquals(countBodyVars([]), 0)
  assertEquals(countBodyVars(null), 0)
})

Deno.test('validateTemplateRow: template nao encontrado', () => {
  const r = validateTemplateRow(null, 0)
  assertEquals(r !== null && r.includes('nao encontrado'), true)
})

Deno.test('validateTemplateRow: APPROVED com variaveis certas passa (null)', () => {
  const row = { status: 'APPROVED', components: bodyWith('Ola {{1}}') }
  assertEquals(validateTemplateRow(row, 1), null)
})

Deno.test('validateTemplateRow: bloqueia cada status nao-APPROVED com msg', () => {
  for (const s of ['PENDING', 'IN_REVIEW', 'REJECTED', 'PAUSED', 'DISABLED']) {
    const r = validateTemplateRow({ status: s, components: bodyWith('x') }, 0)
    assertEquals(typeof r === 'string' && r.length > 0, true)
  }
})

Deno.test('validateTemplateRow: PAUSED e DISABLED tem msg de qualidade', () => {
  assertEquals(validateTemplateRow({ status: 'PAUSED', components: bodyWith('x') }, 0)!.includes('pausado'), true)
  assertEquals(validateTemplateRow({ status: 'DISABLED', components: bodyWith('x') }, 0)!.includes('desabilitado'), true)
})

Deno.test('validateTemplateRow: nº de parameters diferente das vars bloqueia', () => {
  const row = { status: 'APPROVED', components: bodyWith('Ola {{1}}, {{2}}') }
  const r = validateTemplateRow(row, 1) // 2 vars, 1 parametro
  assertEquals(r !== null && r.includes('variavel'), true)
})
