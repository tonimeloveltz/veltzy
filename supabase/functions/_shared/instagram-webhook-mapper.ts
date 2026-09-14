// Converte UM item de entry[].messaging[] do webhook do Instagram em acoes.
// Funcao pura: sem banco, sem fetch. Instagram DM, Onda 1 (Spec 2.5).
// Payloads conforme "Webhooks for Instagram Messaging" da Meta.

export type InstagramMessageType = 'text' | 'image' | 'video' | 'audio' | 'document'

export type InstagramWebhookAction =
  | { kind: 'inbound'; igAccountId: string; igsid: string; mid: string; content: string;
      messageType: InstagramMessageType;
      fileUrl: string | null; fileMimeType: string | null; fileName: string | null;
      adContext: Record<string, unknown> | null; adId: string | null }
  | { kind: 'echo'; igAccountId: string; igsid: string; mid: string; content: string;
      messageType: InstagramMessageType; fileUrl: string | null;
      fileMimeType: string | null; fileName: string | null }
  | { kind: 'read'; igAccountId: string; igsid: string; mid: string }
  | { kind: 'ignored'; reason: string }

export const UNSUPPORTED_MESSAGE_TEXT = '[Mensagem não suportada. Veja no app do Instagram]'
export const STORY_REPLY_PREFIX = '[Resposta ao seu story]'
export const SHARE_LABEL = '[Compartilhou uma publicação]'
export const STORY_MENTION_LABEL = '[Mencionou sua empresa em um story]'

const MEDIA_TYPES: Record<string, { messageType: InstagramMessageType; mime: string }> = {
  image: { messageType: 'image', mime: 'image/jpeg' },
  video: { messageType: 'video', mime: 'video/mp4' },
  audio: { messageType: 'audio', mime: 'audio/mp4' },
  file: { messageType: 'document', mime: 'application/pdf' },
}

// D9: conteudo efemero ou de terceiros vira texto com rotulo e link, sem download.
const SHARE_TYPES = new Set(['share', 'ig_reel', 'reel', 'ig_post'])

interface Draft {
  content: string
  messageType: InstagramMessageType
  fileUrl: string | null
  fileMimeType: string | null
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const asId = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : typeof value === 'number' ? String(value) : null

const ignored = (reason: string): InstagramWebhookAction => ({ kind: 'ignored', reason })

const joinText = (first: string, second: string): string => (first ? `${first}\n${second}` : second)

const textDraft = (content: string): Draft => ({ content, messageType: 'text', fileUrl: null, fileMimeType: null })

const attachmentDraft = (raw: unknown, leadingText: string): Draft => {
  const attachment = asRecord(raw)
  const type = typeof attachment?.type === 'string' ? attachment.type : 'desconhecido'
  const url = asRecord(attachment?.payload)?.url
  const fileUrl = typeof url === 'string' && url !== '' ? url : null

  const media = MEDIA_TYPES[type]
  if (media && fileUrl) {
    return { content: leadingText, messageType: media.messageType, fileUrl, fileMimeType: media.mime }
  }
  if (SHARE_TYPES.has(type)) {
    return textDraft(joinText(leadingText, fileUrl ? `${SHARE_LABEL} ${fileUrl}` : SHARE_LABEL))
  }
  if (type === 'story_mention') {
    return textDraft(joinText(leadingText, fileUrl ? `${STORY_MENTION_LABEL} ${fileUrl}` : STORY_MENTION_LABEL))
  }
  return textDraft(joinText(leadingText, `[Anexo não suportado: ${type}]`))
}

export const mapInstagramMessaging = (entryId: string, item: unknown): InstagramWebhookAction[] => {
  const messaging = asRecord(item)
  if (!messaging) return [ignored('formato_inesperado')]

  const senderId = asId(asRecord(messaging.sender)?.id)
  const recipientId = asId(asRecord(messaging.recipient)?.id)

  if (asRecord(messaging.reaction)) return [ignored('reaction')]

  const read = asRecord(messaging.read)
  if (read) {
    const mid = asId(read.mid)
    if (!senderId) return [ignored('sem_sender')]
    if (!mid) return [ignored('sem_mid')]
    return [{ kind: 'read', igAccountId: entryId, igsid: senderId, mid }]
  }

  const postback = asRecord(messaging.postback)
  if (postback) {
    const mid = asId(postback.mid)
    if (!senderId) return [ignored('sem_sender')]
    if (!mid) return [ignored('sem_mid')]
    const title = typeof postback.title === 'string' && postback.title !== ''
      ? postback.title
      : typeof postback.payload === 'string' ? postback.payload : ''
    if (!title) return [ignored('postback_vazio')]
    return [{
      kind: 'inbound', igAccountId: entryId, igsid: senderId, mid, content: title,
      messageType: 'text', fileUrl: null, fileMimeType: null, fileName: null, adContext: null, adId: null,
    }]
  }

  const message = asRecord(messaging.message)
  if (!message) return [ignored(asRecord(messaging.referral) ? 'referral_sem_mensagem' : 'formato_inesperado')]

  const mid = asId(message.mid)
  if (!mid) return [ignored('sem_mid')]
  if (message.is_deleted === true) return [ignored('deleted')]

  // No echo o sender e a conta da empresa e o recipient e o contato.
  const isEcho = message.is_echo === true
  const igsid = isEcho ? recipientId : senderId
  if (!igsid) return [ignored(isEcho ? 'echo_sem_recipient' : 'sem_sender')]

  const drafts: Draft[] = []
  if (message.is_unsupported === true) {
    drafts.push(textDraft(UNSUPPORTED_MESSAGE_TEXT))
  } else {
    let text = typeof message.text === 'string' ? message.text : ''
    if (asRecord(asRecord(message.reply_to)?.story)) {
      text = text ? `${STORY_REPLY_PREFIX} ${text}` : STORY_REPLY_PREFIX
    }

    const attachments = Array.isArray(message.attachments) ? message.attachments : []
    if (attachments.length === 0) {
      if (!text) return [ignored('mensagem_vazia')]
      drafts.push(textDraft(text))
    } else {
      // Texto junto de anexo vai no content do primeiro anexo.
      attachments.forEach((raw, i) => drafts.push(attachmentDraft(raw, i === 0 ? text : '')))
    }
  }

  const referral = asRecord(message.referral)
  const isAd = referral?.source === 'ADS'
  const adContext = isAd ? referral : null
  const adId = isAd ? asId(referral?.ad_id) : null

  // Dedup do handler e por external_id: o primeiro anexo usa o mid da Meta,
  // os demais ganham sufixo.
  return drafts.map((draft, i): InstagramWebhookAction => {
    const base = {
      igAccountId: entryId,
      igsid,
      mid: i === 0 ? mid : `${mid}:${i}`,
      content: draft.content,
      messageType: draft.messageType,
      fileUrl: draft.fileUrl,
      fileMimeType: draft.fileMimeType,
      fileName: null,
    }
    return isEcho ? { kind: 'echo', ...base } : { kind: 'inbound', ...base, adContext, adId }
  })
}
