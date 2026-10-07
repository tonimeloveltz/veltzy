/**
 * DecisionClient — Client tipado para o Hub /ai-decide (decisao estruturada).
 * Espelha hub-client.ts: Veltzy e Hub compartilham o mesmo projeto Supabase,
 * entao a chamada vai para `${SUPABASE_URL}/functions/v1/ai-decide` com
 * Bearer SERVICE_ROLE + x-veltzy-company-id. A chave de IA (Jev/Anthropic)
 * nunca sai do Hub; aqui so trafegam estado SEM PII e as perguntas.
 */

const TIMEOUT_MS = 20_000
const MAX_RETRIES = 3
const RETRYABLE_CODES = new Set(['PROVIDER_ERROR'])
const NON_RETRYABLE_CODES = new Set(['TENANT_DISABLED', 'LIMIT_EXCEEDED', 'INVALID_REQUEST'])

// --- Types (espelham _shared/jev.ts do ai-decide) ---

export interface JevNoul {
  type: 'noul'
  criteria: { true: string; false: string }
}
export interface JevChoice {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}
export interface JevScore {
  type: 'score'
  instructions: string
  criteria: Record<string, string>
}
export type JevQuestion = JevNoul | JevChoice | JevScore
export type JevQuestions = Record<string, JevQuestion>

/** Estado SEM PII: alvo avaliado + evidencias (texto da janela). Nunca identificador do autor. */
export interface JevState {
  target: string
  context: string[]
}

export interface DecideUsage {
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

export interface DecideRequest {
  company_id: string
  product: 'veltzy'
  feature: string
  state: JevState
  questions: JevQuestions
}

export interface DecideResponse {
  ok: boolean
  data?: {
    answers: Record<string, unknown>
    provider: string
    model: string
    usage: DecideUsage
  }
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

// --- Errors ---

export class DecisionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'DecisionError'
  }
}

// --- Client ---

export class DecisionClient {
  private readonly hubUrl: string
  private readonly hubKey: string

  constructor() {
    const hubUrl = Deno.env.get('SUPABASE_URL')
    const hubKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!hubUrl || !hubKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }
    this.hubUrl = hubUrl
    this.hubKey = hubKey
  }

  async decide(request: DecideRequest): Promise<DecideResponse> {
    return this.callWithRetry<DecideResponse>(
      `${this.hubUrl}/functions/v1/ai-decide`,
      request,
      request.company_id,
    )
  }

  private async callWithRetry<T extends { ok: boolean; error?: { code: string; message: string } }>(
    url: string,
    body: unknown,
    companyId: string,
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.fetchWithTimeout<T>(url, body, companyId)

        if (!result.ok && result.error) {
          if (NON_RETRYABLE_CODES.has(result.error.code)) {
            throw new DecisionError(result.error.code, result.error.message, false)
          }
          if (RETRYABLE_CODES.has(result.error.code) && attempt < MAX_RETRIES - 1) {
            lastError = new DecisionError(result.error.code, result.error.message, true)
            await this.backoff(attempt)
            continue
          }
          throw new DecisionError(result.error.code, result.error.message, false)
        }

        return result
      } catch (err) {
        if (err instanceof DecisionError && !err.retryable) throw err

        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < MAX_RETRIES - 1) {
          await this.backoff(attempt)
        }
      }
    }

    throw lastError ?? new Error('ai-decide request failed after retries')
  }

  private async fetchWithTimeout<T>(url: string, body: unknown, companyId: string): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.hubKey}`,
          'x-veltzy-company-id': companyId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok && res.status >= 500) {
        throw new DecisionError('HTTP_ERROR', `ai-decide returned ${res.status}`, true)
      }

      return await res.json() as T
    } catch (err) {
      if (err instanceof DecisionError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new DecisionError('TIMEOUT', `ai-decide timeout after ${TIMEOUT_MS}ms`, true)
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private backoff(attempt: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, attempt), 4000)
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
