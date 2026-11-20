import { assertEquals } from 'jsr:@std/assert@1'
import { isAckMessage } from './ack-message.ts'

Deno.test('fechamentos não pedem resposta', () => {
  for (const t of ['Combinado ☺', 'Ok 👍', 'Sim', 'Obrigado pelo envio', 'Muito obrigada', '👍', 'kkkk']) {
    assertEquals(isAckMessage(t, 'text'), true, t)
  }
  assertEquals(isAckMessage(null, 'sticker'), true)
})

Deno.test('mensagem real e mídia pedem resposta', () => {
  assertEquals(isAckMessage('Olá bom dia! Tudo bem e com você? Queria saber o valor', 'text'), false)
  assertEquals(isAckMessage('Ok, e quanto fica?', 'text'), false)
  assertEquals(isAckMessage(null, 'audio'), false)
})
