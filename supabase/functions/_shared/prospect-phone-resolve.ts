// Resolucao do AUTOR de uma mensagem de grupo a partir do payload WAHA CRU.
// Cobre a parte POR-PAYLOAD da cascata da SPEC (participant -> participantAlt ->
// remoteJidAlt). O fallback por WAHA API (groups/{id}/participants/v2, Contacts-LIDs)
// NAO roda aqui: o Veltzy nao fala com a WAHA direto (o Hub e dono do base_url +
// WAHA_API_KEY_GLOBAL). Enquanto nao existir um endpoint no Hub pra isso, quando o
// payload nao traz telefone (LID puro) o author_phone_resolved fica null e o
// author_key usa o identificador cru sem sufixo — o V4 trata via "modo alerta".

import { normalizePhoneBR } from './phone.ts'

interface WahaKey {
  id?: string
  fromMe?: boolean
  remoteJid?: string
  remoteJidAlt?: string
  participant?: string
  participantAlt?: string
  addressingMode?: string
}

export interface WahaRawPayload {
  from?: string
  body?: string | null
  fromMe?: boolean
  hasMedia?: boolean
  timestamp?: number
  id?: string
  participant?: string
  participantAlt?: string
  author?: string
  notifyName?: string
  media?: { url?: string; mimetype?: string; filename?: string | null }
  location?: unknown
  vCards?: unknown
  _data?: {
    key?: WahaKey
    pushName?: string
    messageTimestamp?: number
  }
}

const SUFFIX_RE = /@(c\.us|s\.whatsapp\.net|lid|g\.us)$/

/** Remove o sufixo de JID (@c.us|@s.whatsapp.net|@lid|@g.us). */
export function stripJidSuffix(jid: string | null | undefined): string {
  return String(jid ?? '').replace(SUFFIX_RE, '')
}

function isLid(jid: string | null | undefined): boolean {
  return String(jid ?? '').endsWith('@lid')
}

/** Telefone BR normalizado (55+DDD+numero) se o JID for um numero valido; senao null. */
export function phoneFromJid(jid: string | null | undefined): string | null {
  const raw = stripJidSuffix(jid)
  if (!raw || !/^\d+$/.test(raw)) return null
  const norm = normalizePhoneBR(raw)
  return norm.length >= 12 && norm.length <= 13 ? norm : null
}

export interface ResolvedAuthor {
  /** JID cru do autor (participant), pode ser @lid. */
  identifier: string | null
  /** Telefone 55+DDD+num quando resolvido PELO PAYLOAD; null = fallback por-API deferido. */
  phone: string | null
  /** Identidade engine-independente: telefone normalizado, senao o identificador sem sufixo. */
  authorKey: string | null
}

/** Resolve o autor de uma mensagem de GRUPO a partir do payload cru. */
export function resolveAuthorFromPayload(p: WahaRawPayload): ResolvedAuthor {
  const key = p._data?.key ?? {}
  // Autor do grupo: participant (WEBJS) / _data.key.participant (NOWEB) / author.
  const participant = p.participant ?? key.participant ?? p.author ?? null
  const participantAlt = p.participantAlt ?? key.participantAlt ?? null
  const identifier = participant ?? null

  // Telefone por-payload: participant ja e numero -> usa; se @lid -> tenta
  // participantAlt (alguns payloads trazem o numero real); senao null (API deferida).
  let phone: string | null = null
  if (participant && !isLid(participant)) phone = phoneFromJid(participant)
  if (!phone && participantAlt) phone = phoneFromJid(participantAlt)

  const authorKey = phone ?? (identifier ? stripJidSuffix(identifier) : null)
  return { identifier, phone, authorKey }
}
