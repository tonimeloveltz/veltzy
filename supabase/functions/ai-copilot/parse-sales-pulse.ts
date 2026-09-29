// Parse da resposta do modelo no sales-pulse. Funcao PURA, testavel sem I/O.
//
// Retorna null quando a resposta nao e um pulse valido. O chamador devolve
// { ok:false } e o front cai no fallback heuristico. Antes, o texto cru ia
// para `situacao` e o card exibia o JSON (resposta cortada por max_tokens).

export interface SalesPulse {
  situacao: string
  alertas: unknown[]
  acoes: unknown[]
}

// Alguns modelos embrulham o JSON em ```json ... ``` mesmo pedindo "APENAS JSON".
const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

export function parseSalesPulse(content: string | null | undefined): SalesPulse | null {
  if (!content) return null
  const trimmed = content.trim()
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.situacao !== 'string' || !obj.situacao.trim()) return null

  return {
    situacao: obj.situacao,
    alertas: Array.isArray(obj.alertas) ? obj.alertas : [],
    acoes: Array.isArray(obj.acoes) ? obj.acoes : [],
  }
}
