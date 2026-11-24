// URLs publicas de evento. PUBLIC_APP_URL = front do ambiente, sem barra no fim.

const trimSlash = (s: string) => s.replace(/\/+$/, '')

export function appBaseUrl(): string {
  return trimSlash(Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.veltzy.com')
}

export function eventUrl(slug: string, base = appBaseUrl()): string {
  return `${trimSlash(base)}/e/${encodeURIComponent(slug)}`
}

export function registrationUrl(slug: string, token: string, base = appBaseUrl()): string {
  return `${eventUrl(slug, base)}/i/${encodeURIComponent(token)}`
}

export function confirmUrl(slug: string, token: string, base = appBaseUrl()): string {
  return `${registrationUrl(slug, token, base)}?confirmar=1`
}

/** URL publica de um arquivo do bucket event-assets; null se nao ha caminho. */
export function assetUrl(path: string | null | undefined, supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''): string | null {
  if (!path) return null
  const clean = path.split('/').map(encodeURIComponent).join('/')
  return `${trimSlash(supabaseUrl)}/storage/v1/object/public/event-assets/${clean}`
}

/** Troca logo_path/banner_path por logo_url/banner_url absolutas (mantem o resto). */
export function withAssetUrls<T extends Record<string, unknown>>(appearance: T | null | undefined): T & {
  logo_url: string | null
  banner_url: string | null
} {
  const a = (appearance ?? {}) as T
  return {
    ...a,
    logo_url: assetUrl(a.logo_path as string | null),
    banner_url: assetUrl(a.banner_path as string | null),
  }
}
