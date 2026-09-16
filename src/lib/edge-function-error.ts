/**
 * Erro de Edge Function com o codigo que a function devolveu no corpo
 * (ex.: `{ error: 'instagram_window_closed' }`).
 *
 * O supabase-js so expoe "Edge Function returned a non-2xx status code" na
 * mensagem; o corpo da resposta vem em `error.context` (a Response original).
 */
export class EdgeFunctionError extends Error {
  readonly code: string | null
  readonly status: number | null

  constructor(message: string, code: string | null, status: number | null) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.code = code
    this.status = status
  }
}

export const toEdgeFunctionError = async (error: unknown): Promise<EdgeFunctionError> => {
  const fallback = error instanceof Error ? error.message : 'Erro ao chamar a função'
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as { error?: unknown } | null
    const code = typeof body?.error === 'string' ? body.error : null
    return new EdgeFunctionError(code ?? fallback, code, context.status)
  }
  return new EdgeFunctionError(fallback, null, null)
}

export const edgeFunctionErrorCode = (err: unknown): string | null =>
  err instanceof EdgeFunctionError ? err.code : null
