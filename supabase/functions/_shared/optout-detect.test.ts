import { assertEquals } from 'jsr:@std/assert@1'
import { isOptOutMessage, normalizeMessage } from './optout-detect.ts'

Deno.test('keywords simples → opt-out', () => {
  for (const k of ['sair', 'SAIR', 'Parar', 'pare', 'cancelar', 'STOP', 'descadastrar', 'unsubscribe']) {
    assertEquals(isOptOutMessage(k), true, `esperava opt-out em "${k}"`)
  }
})

Deno.test('pontuacao e espacos: "Pare!" e "  cancelar  " → opt-out', () => {
  assertEquals(isOptOutMessage('Pare!'), true)
  assertEquals(isOptOutMessage('  cancelar  '), true)
  assertEquals(isOptOutMessage('SAIR.'), true)
})

Deno.test('acentos removidos: "não quero receber" → opt-out', () => {
  assertEquals(isOptOutMessage('não quero receber'), true)
  assertEquals(isOptOutMessage('nao quero mais'), true)
  assertEquals(isOptOutMessage('Sair da Lista'), true)
})

Deno.test('FALSO-POSITIVO evitado: match exato, nao "contem"/"comeca com"', () => {
  assertEquals(isOptOutMessage('parece'), false)          // contém 'pare' mas nao é
  assertEquals(isOptOutMessage('sair amanha pode?'), false)
  assertEquals(isOptOutMessage('quero sair'), false)
  assertEquals(isOptOutMessage('vou cancelar minha consulta'), false)
  assertEquals(isOptOutMessage('bom dia, tudo bem?'), false)
})

Deno.test('vazio / nulo → false', () => {
  assertEquals(isOptOutMessage(''), false)
  assertEquals(isOptOutMessage(null), false)
  assertEquals(isOptOutMessage(undefined), false)
})

Deno.test('normalizeMessage: normaliza como esperado', () => {
  assertEquals(normalizeMessage('  Não QUERO Receber! '), 'nao quero receber')
  assertEquals(normalizeMessage('Pare!!!'), 'pare')
})
