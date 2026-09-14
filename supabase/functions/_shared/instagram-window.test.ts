import { assertEquals } from 'jsr:@std/assert@1'
import { decideInstagramWindow } from './instagram-window.ts'

const NOW = new Date('2026-09-14T12:00:00Z')
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms)

Deno.test('janela: sem mensagem do contato -> closed', () => {
  assertEquals(decideInstagramWindow(null, NOW, false), 'closed')
  assertEquals(decideInstagramWindow(null, NOW, true), 'closed')
})

Deno.test('janela: 23h59 -> open', () => {
  assertEquals(decideInstagramWindow(ago(23 * HOUR + 59 * MIN), NOW, false), 'open')
})

Deno.test('janela: 24h01 com flag desligada -> closed', () => {
  assertEquals(decideInstagramWindow(ago(24 * HOUR + MIN), NOW, false), 'closed')
})

Deno.test('janela: 24h01 com flag ligada -> human_agent', () => {
  assertEquals(decideInstagramWindow(ago(24 * HOUR + MIN), NOW, true), 'human_agent')
})

Deno.test('janela: 7d01 mesmo com flag -> closed', () => {
  assertEquals(decideInstagramWindow(ago(7 * DAY + MIN), NOW, true), 'closed')
})

Deno.test('janela: data invalida -> closed', () => {
  assertEquals(decideInstagramWindow(new Date('invalida'), NOW, true), 'closed')
})
