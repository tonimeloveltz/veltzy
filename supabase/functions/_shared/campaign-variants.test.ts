import { assertEquals } from 'jsr:@std/assert@1'
import { assignVariants, extractVariables, sameVariables, validateVariant, MAX_MESSAGE_LENGTH } from './campaign-variants.ts'

const ORIG = 'Oi {{nome}}, tudo bem? Temos uma oferta para a {{empresa}}.'

Deno.test('extractVariables: unicas, minusculas, ordenadas, tolera espacos', () => {
  assertEquals(extractVariables('{{ Nome }} e {{empresa}} e {{nome}}'), ['empresa', 'nome'])
  assertEquals(extractVariables('sem variavel'), [])
})

Deno.test('sameVariables: mesmo conjunto, ordem e caixa nao importam', () => {
  assertEquals(sameVariables(ORIG, 'A {{EMPRESA}} tem algo pra voce, {{ nome }}!'), true)
  assertEquals(sameVariables(ORIG, 'Oi {{nome}}!'), false)
})

Deno.test('validateVariant: ok', () => {
  assertEquals(validateVariant(ORIG, 'Ola {{nome}}! Separamos algo para a {{empresa}}.'), { ok: true })
})

Deno.test('validateVariant: perdeu variavel', () => {
  assertEquals(validateVariant(ORIG, 'Ola {{nome}}! Temos uma oferta.'), { ok: false, reason: 'missing_vars' })
})

Deno.test('validateVariant: inventou variavel', () => {
  assertEquals(
    validateVariant(ORIG, 'Ola {{nome}} de {{cidade}}, oferta para a {{empresa}}.'),
    { ok: false, reason: 'extra_vars' },
  )
})

Deno.test('validateVariant: vazio e longo', () => {
  assertEquals(validateVariant(ORIG, '   '), { ok: false, reason: 'empty' })
  assertEquals(validateVariant('x', 'x'.repeat(MAX_MESSAGE_LENGTH + 1)), { ok: false, reason: 'too_long' })
})

Deno.test('validateVariant: igual a original ou a outra versao (normalizado)', () => {
  assertEquals(validateVariant(ORIG, '  oi {{nome}},   tudo bem? Temos uma oferta para a {{empresa}}. '), { ok: false, reason: 'duplicate' })
  const outra = 'Ola {{nome}}! Separamos algo para a {{empresa}}.'
  assertEquals(validateVariant(ORIG, outra, [outra]), { ok: false, reason: 'duplicate' })
})

const counts = (arr: number[], k: number) => Array.from({ length: k }, (_, i) => arr.filter((x) => x === i).length)

Deno.test('assignVariants: fatias iguais (10 em 3 → 4/3/3)', () => {
  const out = assignVariants(10, 3)
  assertEquals(out.length, 10)
  assertEquals(counts(out, 3), [4, 3, 3])
})

Deno.test('assignVariants: balanceado em qualquer embaralhamento', () => {
  for (let t = 0; t < 50; t++) {
    const c = counts(assignVariants(17, 5), 5)
    assertEquals(Math.max(...c) - Math.min(...c) <= 1, true)
    assertEquals(c.reduce((a, b) => a + b, 0), 17)
  }
})

Deno.test('assignVariants: n < k, k = 1, n = 0', () => {
  assertEquals(counts(assignVariants(2, 5), 5), [1, 1, 0, 0, 0])
  assertEquals(assignVariants(4, 1), [0, 0, 0, 0])
  assertEquals(assignVariants(0, 3), [])
})

Deno.test('assignVariants: rand deterministico embaralha', () => {
  // rand = 0 sempre troca i com 0: [0,1,2,0] → resultado fixo e reproduzivel
  const a = assignVariants(4, 3, () => 0)
  const b = assignVariants(4, 3, () => 0)
  assertEquals(a, b)
  assertEquals(counts(a, 3), [2, 1, 1])
})
