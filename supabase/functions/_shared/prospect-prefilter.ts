// Pre-filtro DETERMINISTICO do inbound de grupo. PURO e testavel: as checagens que
// dependem do banco (autor ja contatado / lead com opt-out) sao resolvidas pela edge
// e entram como flags. Qualquer skip evita gravar o raw e classificar (economia de
// custo de IA + privacidade: nao guarda o que nao vira sinal).

export interface PrefilterInput {
  text: string | null | undefined
  hasMedia: boolean
  fromMe: boolean
  /** autor ja presente em prospect_contacted (1 contato por pessoa, pra sempre). */
  alreadyContacted: boolean
  /** lead do autor com marketing_opt_out=true. */
  leadOptedOut: boolean
}

export type PrefilterReason =
  | 'from_self'
  | 'media_no_text'
  | 'too_short'
  | 'already_contacted'
  | 'lead_opted_out'

export interface PrefilterResult {
  skip: boolean
  reason?: PrefilterReason
}

/** Minimo de caracteres uteis para valer classificacao. */
export const MIN_TEXT_LEN = 15

export function prefilterGroupMessage(i: PrefilterInput): PrefilterResult {
  if (i.fromMe) return { skip: true, reason: 'from_self' }
  const text = (i.text ?? '').trim()
  if (i.hasMedia && !text) return { skip: true, reason: 'media_no_text' }
  if (text.length < MIN_TEXT_LEN) return { skip: true, reason: 'too_short' }
  if (i.alreadyContacted) return { skip: true, reason: 'already_contacted' }
  if (i.leadOptedOut) return { skip: true, reason: 'lead_opted_out' }
  return { skip: false }
}
