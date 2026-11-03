// Espelho client da validação de versões (supabase/functions/_shared/campaign-variants.ts).
// Mesma regra: a versão precisa ter EXATAMENTE as variáveis {{x}} da mensagem original.
// O client não importa código de supabase/functions; os testes dos dois lados cobrem os
// mesmos casos.

export const MIN_VERSIONS = 2
export const MAX_VERSIONS = 5
export const DEFAULT_VERSIONS = 3
export const MAX_MESSAGE_LENGTH = 4096

const VAR_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g

export const extractNamedVariables = (text: string): string[] => {
  const found = new Set<string>()
  for (const m of text.matchAll(VAR_RE)) found.add(m[1].toLowerCase())
  return [...found].sort()
}

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

export type VariantCheck =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'too_long' | 'duplicate' }
  | { ok: false; reason: 'missing_vars' | 'extra_vars'; vars: string[] }

export const validateVariant = (original: string, variant: string, existing: string[] = []): VariantCheck => {
  const text = variant.trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too_long' }
  const orig = extractNamedVariables(original)
  const got = extractNamedVariables(text)
  const missing = orig.filter((v) => !got.includes(v))
  if (missing.length) return { ok: false, reason: 'missing_vars', vars: missing }
  const extra = got.filter((v) => !orig.includes(v))
  if (extra.length) return { ok: false, reason: 'extra_vars', vars: extra }
  const n = normalize(text)
  if ([original, ...existing].some((e) => normalize(e) === n)) return { ok: false, reason: 'duplicate' }
  return { ok: true }
}

/** Mensagem de negócio para o card da versão. */
export const variantProblem = (check: VariantCheck): string | null => {
  if (check.ok) return null
  switch (check.reason) {
    case 'empty': return 'A versão está vazia.'
    case 'too_long': return 'A versão está longa demais.'
    case 'duplicate': return 'Esta versão está igual a outra.'
    case 'missing_vars': return `Esta versão precisa ter ${check.vars.map((v) => `{{${v}}}`).join(', ')}.`
    case 'extra_vars': return `${check.vars.map((v) => `{{${v}}}`).join(', ')} não existe na mensagem original.`
  }
}

export interface VariantDraft {
  text: string
  status: 'pending' | 'approved'
}

/** Todas as versões aprovadas e válidas (contra a original e entre si). */
export const allVariantsReady = (original: string, drafts: VariantDraft[]): boolean =>
  drafts.every((d, i) =>
    d.status === 'approved' &&
    validateVariant(original, d.text, drafts.filter((_, j) => j !== i).map((x) => x.text)).ok)

/** message_variants para gravar: [original, ...versões] só com 1+ versão; senão null. */
export const buildMessageVariants = (original: string, drafts: VariantDraft[]): string[] | null =>
  drafts.length ? [original.trim(), ...drafts.map((d) => d.text.trim())] : null
