import { assertEquals } from 'jsr:@std/assert@1'
import {
  mapInstagramMessaging,
  SHARE_LABEL,
  STORY_MENTION_LABEL,
  STORY_REPLY_PREFIX,
  UNSUPPORTED_MESSAGE_TEXT,
  type InstagramWebhookAction,
} from './instagram-webhook-mapper.ts'

// Payloads no formato da doc "Webhooks for Instagram Messaging" da Meta.
const IG = '17841400000000001' // conta profissional (entry.id)
const USER = '1234567890123456' // IGSID do contato
const MID = 'aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQx'

const fromContact = (message: Record<string, unknown>) => ({
  sender: { id: USER },
  recipient: { id: IG },
  timestamp: 1757851200000,
  message: { mid: MID, ...message },
})

const inbound = (overrides: Partial<Extract<InstagramWebhookAction, { kind: 'inbound' }>>): InstagramWebhookAction => ({
  kind: 'inbound',
  igAccountId: IG,
  igsid: USER,
  mid: MID,
  content: '',
  messageType: 'text',
  fileUrl: null,
  fileMimeType: null,
  fileName: null,
  adContext: null,
  adId: null,
  ...overrides,
})

Deno.test('mapper: texto sem anexo -> inbound texto', () => {
  assertEquals(mapInstagramMessaging(IG, fromContact({ text: 'oi' })), [inbound({ content: 'oi' })])
})

Deno.test('mapper: is_echo -> echo com igsid = recipient.id', () => {
  const item = { sender: { id: IG }, recipient: { id: USER }, timestamp: 1, message: { mid: MID, text: 'resposta', is_echo: true } }
  assertEquals(mapInstagramMessaging(IG, item), [{
    kind: 'echo', igAccountId: IG, igsid: USER, mid: MID, content: 'resposta',
    messageType: 'text', fileUrl: null, fileMimeType: null, fileName: null,
  }])
})

Deno.test('mapper: echo de anexo -> echo image', () => {
  const item = {
    sender: { id: IG }, recipient: { id: USER }, timestamp: 1,
    message: { mid: MID, is_echo: true, attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }] },
  }
  const [action] = mapInstagramMessaging(IG, item)
  assertEquals(action.kind, 'echo')
  if (action.kind === 'echo') {
    assertEquals(action.igsid, USER)
    assertEquals(action.messageType, 'image')
    assertEquals(action.fileUrl, 'https://cdn/x.jpg')
  }
})

Deno.test('mapper: is_deleted -> ignored deleted', () => {
  assertEquals(mapInstagramMessaging(IG, fromContact({ is_deleted: true })), [{ kind: 'ignored', reason: 'deleted' }])
})

Deno.test('mapper: is_unsupported -> inbound com aviso', () => {
  assertEquals(mapInstagramMessaging(IG, fromContact({ is_unsupported: true })), [inbound({ content: UNSUPPORTED_MESSAGE_TEXT })])
})

Deno.test('mapper: reply_to.story -> prefixo no texto', () => {
  const item = fromContact({ text: 'que lindo', reply_to: { story: { url: 'https://cdn/story', id: '99' } } })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: `${STORY_REPLY_PREFIX} que lindo` })])
})

Deno.test('mapper: reply_to de mensagem (nao story) nao ganha prefixo', () => {
  const item = fromContact({ text: 'isso', reply_to: { mid: 'outro' } })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: 'isso' })])
})

Deno.test('mapper: quick_reply usa message.text', () => {
  const item = fromContact({ text: 'Quero orçamento', quick_reply: { payload: 'ORCAMENTO' } })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: 'Quero orçamento' })])
})

Deno.test('mapper: anexos de midia mapeiam tipo e mime', () => {
  const cases: [string, string, string][] = [
    ['image', 'image', 'image/jpeg'],
    ['video', 'video', 'video/mp4'],
    ['audio', 'audio', 'audio/mp4'],
    ['file', 'document', 'application/pdf'],
  ]
  for (const [type, messageType, mime] of cases) {
    const item = fromContact({ attachments: [{ type, payload: { url: `https://cdn/${type}` } }] })
    assertEquals(mapInstagramMessaging(IG, item), [inbound({
      messageType: messageType as 'image', fileUrl: `https://cdn/${type}`, fileMimeType: mime,
    })])
  }
})

Deno.test('mapper: share, ig_reel, reel e ig_post viram texto com link, sem download', () => {
  for (const type of ['share', 'ig_reel', 'reel', 'ig_post']) {
    const item = fromContact({ attachments: [{ type, payload: { url: 'https://instagram.com/p/abc' } }] })
    assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: `${SHARE_LABEL} https://instagram.com/p/abc` })])
  }
})

Deno.test('mapper: story_mention vira texto com link', () => {
  const item = fromContact({ attachments: [{ type: 'story_mention', payload: { url: 'https://cdn/story' } }] })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: `${STORY_MENTION_LABEL} https://cdn/story` })])
})

Deno.test('mapper: tipo desconhecido vira aviso de anexo nao suportado', () => {
  const item = fromContact({ attachments: [{ type: 'location', payload: {} }] })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: '[Anexo não suportado: location]' })])
})

Deno.test('mapper: varios anexos -> uma acao por anexo, mid com sufixo a partir do segundo', () => {
  const item = fromContact({
    attachments: [
      { type: 'image', payload: { url: 'https://cdn/1' } },
      { type: 'image', payload: { url: 'https://cdn/2' } },
    ],
  })
  const actions = mapInstagramMessaging(IG, item)
  assertEquals(actions.length, 2)
  assertEquals(actions.map((a) => (a.kind === 'inbound' ? a.mid : null)), [MID, `${MID}:1`])
})

Deno.test('mapper: texto + anexo -> texto no content do primeiro anexo', () => {
  const item = fromContact({
    text: 'olha essa foto',
    attachments: [
      { type: 'image', payload: { url: 'https://cdn/1' } },
      { type: 'share', payload: { url: 'https://instagram.com/p/abc' } },
    ],
  })
  const actions = mapInstagramMessaging(IG, item)
  assertEquals(actions[0], inbound({ content: 'olha essa foto', messageType: 'image', fileUrl: 'https://cdn/1', fileMimeType: 'image/jpeg' }))
  assertEquals(actions[1], inbound({ mid: `${MID}:1`, content: `${SHARE_LABEL} https://instagram.com/p/abc` }))
})

Deno.test('mapper: referral ADS -> adContext e adId', () => {
  const referral = { ref: 'campanha', ad_id: '120210000000000', source: 'ADS', type: 'OPEN_THREAD' }
  const item = fromContact({ text: 'vi o anuncio', referral })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: 'vi o anuncio', adContext: referral, adId: '120210000000000' })])
})

Deno.test('mapper: referral que nao e ADS nao vira adContext', () => {
  const item = fromContact({ text: 'oi', referral: { ref: 'link', source: 'IGME', type: 'OPEN_THREAD' } })
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ content: 'oi' })])
})

Deno.test('mapper: postback -> inbound texto com title e mid do postback', () => {
  const item = { sender: { id: USER }, recipient: { id: IG }, timestamp: 1, postback: { mid: 'pb-mid', title: 'Falar com vendedor', payload: 'VENDEDOR' } }
  assertEquals(mapInstagramMessaging(IG, item), [inbound({ mid: 'pb-mid', content: 'Falar com vendedor' })])
})

Deno.test('mapper: read -> read', () => {
  const item = { sender: { id: USER }, recipient: { id: IG }, timestamp: 1, read: { mid: MID } }
  assertEquals(mapInstagramMessaging(IG, item), [{ kind: 'read', igAccountId: IG, igsid: USER, mid: MID }])
})

Deno.test('mapper: reaction -> ignored reaction', () => {
  const item = { sender: { id: USER }, recipient: { id: IG }, timestamp: 1, reaction: { mid: MID, action: 'react', reaction: 'love', emoji: '❤️' } }
  assertEquals(mapInstagramMessaging(IG, item), [{ kind: 'ignored', reason: 'reaction' }])
})

Deno.test('mapper: sem sender, sem mid e formato inesperado -> ignored', () => {
  assertEquals(mapInstagramMessaging(IG, { recipient: { id: IG }, message: { mid: MID, text: 'oi' } }), [{ kind: 'ignored', reason: 'sem_sender' }])
  assertEquals(mapInstagramMessaging(IG, { sender: { id: USER }, message: { text: 'oi' } }), [{ kind: 'ignored', reason: 'sem_mid' }])
  assertEquals(mapInstagramMessaging(IG, null), [{ kind: 'ignored', reason: 'formato_inesperado' }])
  assertEquals(mapInstagramMessaging(IG, 'texto'), [{ kind: 'ignored', reason: 'formato_inesperado' }])
  assertEquals(mapInstagramMessaging(IG, { sender: { id: USER } }), [{ kind: 'ignored', reason: 'formato_inesperado' }])
})

Deno.test('mapper: messaging_referral sem mensagem -> ignored', () => {
  const item = { sender: { id: USER }, recipient: { id: IG }, timestamp: 1, referral: { ref: 'x', source: 'IGME', type: 'OPEN_THREAD' } }
  assertEquals(mapInstagramMessaging(IG, item), [{ kind: 'ignored', reason: 'referral_sem_mensagem' }])
})

Deno.test('mapper: mensagem vazia sem anexo -> ignored', () => {
  assertEquals(mapInstagramMessaging(IG, fromContact({})), [{ kind: 'ignored', reason: 'mensagem_vazia' }])
})
