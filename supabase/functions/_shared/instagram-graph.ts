// Cliente minimo da Instagram API com Instagram Login (graph.instagram.com).
// Instagram DM, Onda 1 (docs/features/instagram-dm/Spec.md, secao 2.1).
//
// O token de usuario vai no header Authorization, nunca na URL. As chamadas de
// troca e renovacao de token exigem segredo na query (padrao da Meta), entao a
// URL NUNCA e logada, nem dentro de mensagem de erro de rede.

export const INSTAGRAM_GRAPH_VERSION = 'v26.0'
export const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
/** Host sem versao: access_token e refresh_access_token nao sao versionados. */
export const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com'

export interface GraphError {
  status: number
  code: number | null
  message: string
}

export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError }

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  token?: string
  query?: Record<string, string>
  /** Objeto vira JSON; URLSearchParams vai como form-urlencoded. */
  body?: Record<string, unknown> | URLSearchParams
}

/**
 * Ids do Instagram passam de 2^53 e a Meta as vezes os devolve como numero
 * (ex.: user_id da troca do code). JSON.parse arredondaria em silencio, entao
 * todo inteiro de 16+ digitos vira string antes do parse.
 */
export const parseJsonKeepingBigIds = (text: string): unknown => {
  if (!text) return null
  const quoted = text.replace(/("[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"')
  try {
    return JSON.parse(quoted)
  } catch {
    return null
  }
}

/** Le os dois formatos de erro: `{ error: { code, message } }` e `{ error_type, code, error_message }`. */
export const parseGraphError = (status: number, json: unknown): GraphError => {
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const nested = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : null
  const src = nested ?? root
  const rawCode = src.code
  const code = typeof rawCode === 'number'
    ? rawCode
    : typeof rawCode === 'string' && /^\d+$/.test(rawCode) ? Number(rawCode) : null
  const rawMessage = src.message ?? src.error_message ?? (typeof root.error === 'string' ? root.error : null)
  const message = typeof rawMessage === 'string' && rawMessage ? rawMessage : `HTTP ${status}`
  return { status, code, message }
}

/** 190 = token invalido ou expirado. */
export const isTokenInvalid = (error: GraphError): boolean => error.code === 190

const hasErrorField = (json: unknown): boolean =>
  !!json && typeof json === 'object' && ('error' in json || 'error_type' in json)

/** Path relativo ('/me') usa INSTAGRAM_GRAPH_BASE; URL absoluta e usada como veio. */
export async function graphRequest<T>(path: string, options: GraphRequestOptions = {}): Promise<GraphResult<T>> {
  const target = /^https?:\/\//.test(path)
    ? path
    : `${INSTAGRAM_GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const url = new URL(target)
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v)

  const headers: Record<string, string> = {}
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`

  let body: string | URLSearchParams | undefined
  if (options.body instanceof URLSearchParams) {
    body = options.body
  } else if (options.body) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let res: Response
  try {
    res = await fetch(url, { method: options.method ?? 'GET', headers, body })
  } catch {
    // A mensagem de erro de rede do Deno inclui a URL, que pode levar segredo.
    return { ok: false, error: { status: 0, code: null, message: 'Falha de rede ao chamar a API do Instagram' } }
  }

  const json = parseJsonKeepingBigIds(await res.text().catch(() => ''))
  if (!res.ok || hasErrorField(json)) {
    return { ok: false, error: parseGraphError(res.status, json) }
  }
  return { ok: true, data: json as T }
}
