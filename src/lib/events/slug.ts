// Slug do evento: sem acento, minusculas, so a-z0-9 e hifen, 3 a 80 caracteres.
// Mesma regra do CHECK events_slug_format e de event_slug_available no Hub.

export const RESERVED_SLUGS = new Set(['new', 'admin', 'api', 'e', 'i', 'c', 'login', 'app'])
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(text: string, max = 80): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

export const isValidSlug = (slug: string): boolean =>
  SLUG_RE.test(slug) && slug.length >= 3 && slug.length <= 80 && !RESERVED_SLUGS.has(slug)

/** Sufixo curto aleatorio (a-z0-9) para slug de rascunho novo. */
export function randomSuffix(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Slug do rascunho criado pelo botao "Criar evento": unico na pratica, trocado no editor. */
export const draftSlug = (title: string): string => `${slugify(title, 70) || 'evento'}-${randomSuffix()}`
