import { assertEquals } from 'jsr:@std/assert@1'
import { echoMatchesMessage, findEchoMatch, type EchoCandidate } from './instagram-echo-match.ts'

const row = (overrides: Partial<EchoCandidate>): EchoCandidate => ({
  id: 'm-1',
  content: 'ok',
  external_id: null,
  message_type: 'text',
  ...overrides,
})

Deno.test('echo texto: mensagem do Veltzy ainda sem external_id casa', () => {
  assertEquals(echoMatchesMessage({ content: 'ok', messageType: 'text' }, row({})), true)
})

Deno.test('echo texto: resposta do dono ja gravada com external_id NAO casa ("ok", "ok")', () => {
  const firstOwnerReply = row({ id: 'm-dono-1', external_id: 'mid-1' })
  assertEquals(echoMatchesMessage({ content: 'ok', messageType: 'text' }, firstOwnerReply), false)
  assertEquals(findEchoMatch({ content: 'ok', messageType: 'text' }, [firstOwnerReply]), null)
})

Deno.test('echo texto: legenda casa com a linha da midia mesmo com external_id preenchido', () => {
  const media = row({ content: 'olha a foto', external_id: 'mid-midia', message_type: 'image' })
  assertEquals(echoMatchesMessage({ content: 'olha a foto', messageType: 'text' }, media), true)
})

Deno.test('echo texto: conteudo diferente nao casa', () => {
  assertEquals(echoMatchesMessage({ content: 'ok!', messageType: 'text' }, row({})), false)
})

Deno.test('echo anexo: casa por tipo com linha sem external_id', () => {
  const image = row({ content: 'foto.png', message_type: 'image' })
  assertEquals(echoMatchesMessage({ content: '', messageType: 'image' }, image), true)
})

Deno.test('echo anexo: linha com external_id ou de outro tipo nao casa', () => {
  assertEquals(echoMatchesMessage({ content: '', messageType: 'image' }, row({ message_type: 'image', external_id: 'mid' })), false)
  assertEquals(echoMatchesMessage({ content: '', messageType: 'image' }, row({ message_type: 'video' })), false)
})

Deno.test('findEchoMatch: devolve o primeiro (mais recente) que casa', () => {
  const candidates = [
    row({ id: 'recente-dono', external_id: 'mid-9' }),
    row({ id: 'veltzy-pendente' }),
    row({ id: 'mais-antiga' }),
  ]
  assertEquals(findEchoMatch({ content: 'ok', messageType: 'text' }, candidates)?.id, 'veltzy-pendente')
})
