// Detecção de opt-out de marketing (SAIR/PARE...) numa mensagem inbound do lead.
// Lógica PURA e testável. Match CONSERVADOR: a mensagem INTEIRA normalizada
// (trim + lowercase + sem acento + sem pontuação + espaços colapsados) tem que ser
// IGUAL a uma keyword — não 'contém' nem 'começa com'. Evita falso-positivo
// ('parece' não é 'pare'; 'sair amanha pode?' não é 'sair').

// Lista já pensada normalizada (decisão Toni/Copiloto).
const OPT_OUT_KEYWORDS: ReadonlySet<string> = new Set([
  'sair', 'parar', 'pare', 'cancelar', 'cancela', 'stop', 'descadastrar', 'unsubscribe',
  'sair da lista', 'nao quero receber', 'nao quero mais', 'remover da lista',
])

/** trim + lowercase + remove acentos + remove pontuação + colapsa espaços. */
export function normalizeMessage(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove diacríticos (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')                      // pontuação/emoji -> espaço
    .replace(/\s+/g, ' ')                              // colapsa espacos
    .trim()
}

/** true se a mensagem e EXATAMENTE um pedido de opt-out. */
export function isOptOutMessage(content: string | null | undefined): boolean {
  if (!content) return false
  return OPT_OUT_KEYWORDS.has(normalizeMessage(content))
}
