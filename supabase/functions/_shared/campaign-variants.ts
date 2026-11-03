// Variações da mensagem livre de campanha (SPEC campanha-variacoes-ia). Lógica PURA
// e testável: validação das versões geradas pela IA (ou editadas) contra a mensagem
// original e atribuição balanceada das versões aos destinatários.
// Espelho client: src/lib/campaign-variants.ts (mesma regra de validação).

export const MAX_VARIANTS = 5
export const MAX_MESSAGE_LENGTH = 4096

const VAR_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g

/** Nomes das variáveis {{x}} do texto, em minúsculas, únicos e ordenados. */
export function extractVariables(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(VAR_RE)) found.add(m[1].toLowerCase())
  return [...found].sort()
}

/** Mesmo conjunto de variáveis (nada a menos, nada a mais). */
export function sameVariables(original: string, variant: string): boolean {
  const a = extractVariables(original)
  const b = extractVariables(variant)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

export type VariantInvalidReason = 'empty' | 'too_long' | 'missing_vars' | 'extra_vars' | 'duplicate'

/**
 * Valida uma versão contra a original. `existing` = textos que ela não pode repetir
 * (a original e as outras versões); comparação normalizada (espaços, caixa).
 */
export function validateVariant(
  original: string,
  variant: string,
  existing: string[] = [],
): { ok: true } | { ok: false; reason: VariantInvalidReason } {
  const text = variant.trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too_long' }
  const orig = new Set(extractVariables(original))
  const got = new Set(extractVariables(text))
  if ([...orig].some((v) => !got.has(v))) return { ok: false, reason: 'missing_vars' }
  if ([...got].some((v) => !orig.has(v))) return { ok: false, reason: 'extra_vars' }
  const n = normalize(text)
  if ([original, ...existing].some((e) => normalize(e) === n)) return { ok: false, reason: 'duplicate' }
  return { ok: true }
}

/**
 * Atribui a cada um dos `n` destinatários um índice de versão 0..k-1, em fatias
 * iguais (diferença máxima 1; a sobra vai para os primeiros índices), embaralhado
 * por Fisher-Yates. Equivale a embaralhar os destinatários e repartir em fatias:
 * NÃO é sorteio independente por destinatário. `k <= 1` → todos 0.
 */
export function assignVariants(n: number, k: number, rand: () => number = Math.random): number[] {
  if (n <= 0) return []
  if (k <= 1) return new Array(n).fill(0)
  const out = Array.from({ length: n }, (_, i) => i % k)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
