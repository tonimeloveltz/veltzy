import { assertEquals } from 'jsr:@std/assert@1'
import { pickInstance } from './resolve-instance.ts'

const live = [{ name: 'loja-2', status: 'connected' }]

Deno.test('numero do lead removido (reconexao x -> x-2) cai no unico conectado', () => {
  assertEquals(pickInstance(['loja', null], live), 'loja-2')
})

Deno.test('numero do lead existente tem prioridade', () => {
  const insts = [{ name: 'a', status: 'connected' }, { name: 'b', status: 'connected' }]
  assertEquals(pickInstance(['b', 'a'], insts), 'b')
})

Deno.test('candidato removido pula para o proximo candidato valido', () => {
  const insts = [{ name: 'a', status: 'connected' }, { name: 'b', status: 'connected' }]
  assertEquals(pickInstance(['velho', 'a'], insts), 'a')
})

Deno.test('numero existente mas desconectado continua valendo (sem troca silenciosa)', () => {
  const insts = [{ name: 'a', status: 'disconnected' }, { name: 'b', status: 'connected' }]
  assertEquals(pickInstance(['a'], insts), 'a')
})

Deno.test('varios conectados e nenhum candidato valido: null', () => {
  const insts = [{ name: 'a', status: 'connected' }, { name: 'b', status: 'connected' }]
  assertEquals(pickInstance(['velho', null], insts), null)
})

Deno.test('sem candidato e numero unico conectado: usa ele', () => {
  assertEquals(pickInstance([null, undefined], live), 'loja-2')
})

Deno.test('lista indisponivel: confia no primeiro candidato (comportamento antigo)', () => {
  assertEquals(pickInstance([null, 'x', 'y'], null), 'x')
  assertEquals(pickInstance([], null), null)
})
