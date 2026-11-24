// Open Graph da pagina publica do evento (D11). Vercel Function no runtime edge.
// O WhatsApp e as redes nao executam JS: esta funcao injeta as metas do evento no index.html
// do proprio deploy. A URL do navegador nao muda; o React Router renderiza /e/:slug normalmente.

export const config = { runtime: 'edge' }

declare const process: { env: Record<string, string | undefined> }

interface PublicEvent {
  title: string
  description: string | null
  appearance?: { banner_url?: string | null; logo_url?: string | null }
}

const SLUG_RE = /^[a-z0-9-]{3,80}$/

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Descricao sem Markdown, numa linha, ate 160 caracteres. */
export const plainDescription = (md: string | null): string => {
  const text = (md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[#*_`>~]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text
}

export const injectMeta = (html: string, ev: PublicEvent, pageUrl: string): string => {
  const image = ev.appearance?.banner_url || ev.appearance?.logo_url || null
  const desc = plainDescription(ev.description)
  const title = escapeHtml(ev.title)
  const tags = [
    `<meta property="og:title" content="${title}" />`,
    desc ? `<meta property="og:description" content="${escapeHtml(desc)}" />` : '',
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
    `<meta property="og:url" content="${escapeHtml(pageUrl)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
  ].filter(Boolean).join('\n    ')
  // Tira as og:/twitter: genericas do index para nao haver duas de cada.
  const cleaned = html
    .replace(/<meta\s+(property|name)="(og|twitter):[^"]*"[^>]*>\s*/g, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  return cleaned.replace('</head>', `    ${tags}\n  </head>`)
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') ?? ''
  const indexRes = await fetch(new URL('/index.html', url.origin))
  const html = await indexRes.text()
  const htmlResponse = (body: string, cache: string) =>
    new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache } })

  if (!SLUG_RE.test(slug)) return htmlResponse(html, 'public, s-maxage=60')

  const base = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !anon) return htmlResponse(html, 'public, s-maxage=60')

  try {
    const res = await fetch(`${base}/functions/v1/event-public?slug=${encodeURIComponent(slug)}`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (!res.ok) return htmlResponse(html, 'public, s-maxage=60')
    const ev = await res.json() as PublicEvent
    return htmlResponse(injectMeta(html, ev, `${url.origin}/e/${slug}`), 'public, s-maxage=300, stale-while-revalidate=600')
  } catch {
    return htmlResponse(html, 'public, s-maxage=60')
  }
}
