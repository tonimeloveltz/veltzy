// Regra para casar o echo da Meta com a mensagem que o proprio Veltzy enviou
// (Instagram DM, Onda 1, Spec 5.2). Funcao pura: o webhook busca as mensagens
// nao-lead recentes do lead e aplica esta regra.

export interface EchoCandidate {
  id: string
  content: string
  external_id: string | null
  message_type: string
}

export interface EchoToMatch {
  content: string
  messageType: string
}

/**
 * - Echo de anexo nao traz texto: casa com mensagem ainda sem external_id e do mesmo tipo.
 * - Echo de texto casa com o mesmo content quando a linha ainda nao tem external_id,
 *   ou quando a linha e de midia (legenda enviada em segunda chamada). Texto que ja
 *   tem external_id NAO casa: senao a segunda resposta igual do dono pelo app
 *   ("ok", "ok") seria descartada.
 */
export const echoMatchesMessage = (echo: EchoToMatch, candidate: EchoCandidate): boolean => {
  if (echo.messageType === 'text') {
    return candidate.content === echo.content
      && (candidate.external_id === null || candidate.message_type !== 'text')
  }
  return candidate.external_id === null && candidate.message_type === echo.messageType
}

/** Candidatos em ordem de created_at decrescente: devolve o mais recente que casa. */
export const findEchoMatch = <T extends EchoCandidate>(echo: EchoToMatch, candidates: readonly T[]): T | null =>
  candidates.find((candidate) => echoMatchesMessage(echo, candidate)) ?? null
