/**
 * HubClient — Client tipado para Hub /ai-complete e /ai-embeddings.
 * Toda chamada de IA passa pelo Hub (chave OpenAI nunca sai do Hub).
 */

const TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const RETRYABLE_CODES = new Set(['PROVIDER_ERROR'])
const NON_RETRYABLE_CODES = new Set(['TENANT_DISABLED', 'LIMIT_EXCEEDED', 'INVALID_REQUEST'])

// --- Types ---

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAIToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface HubCompleteRequest {
  company_id: string
  product: 'veltzy'
  feature: string
  lead_id?: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: ToolCall[]
    tool_call_id?: string
  }>
  tools?: OpenAIToolDef[]
  max_tokens?: number
  temperature?: number
}

export interface HubUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number
}

export interface HubCompleteResponse {
  ok: boolean
  data?: {
    content: string | null
    tool_calls?: ToolCall[]
    usage: HubUsage
    model: string
    finish_reason: string
  }
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface HubEmbeddingsRequest {
  company_id: string
  product: 'veltzy'
  feature: string
  input: string | string[]
}

export interface HubEmbeddingsResponse {
  ok: boolean
  data?: {
    embeddings: number[][]
    usage: HubUsage
  }
  error?: {
    code: string
    message: string
  }
}

// --- Errors ---

export class HubError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'HubError'
  }
}

// --- Client ---

export class HubClient {
  private readonly hubUrl: string
  private readonly hubKey: string

  constructor() {
    // Veltzy e Hub compartilham o mesmo projeto Supabase (zxefzegggntfjlfsdgvw).
    // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao injetadas automaticamente pelo Supabase.
    const hubUrl = Deno.env.get('SUPABASE_URL')
    const hubKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!hubUrl || !hubKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }
    this.hubUrl = hubUrl
    this.hubKey = hubKey
  }

  async complete(request: HubCompleteRequest): Promise<HubCompleteResponse> {
    return this.callWithRetry<HubCompleteResponse>(
      `${this.hubUrl}/functions/v1/ai-complete`,
      request,
      request.company_id,
    )
  }

  async embeddings(request: HubEmbeddingsRequest): Promise<HubEmbeddingsResponse> {
    return this.callWithRetry<HubEmbeddingsResponse>(
      `${this.hubUrl}/functions/v1/ai-embeddings`,
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
            throw new HubError(result.error.code, result.error.message, false)
          }
          if (RETRYABLE_CODES.has(result.error.code) && attempt < MAX_RETRIES - 1) {
            lastError = new HubError(result.error.code, result.error.message, true)
            await this.backoff(attempt)
            continue
          }
          throw new HubError(result.error.code, result.error.message, false)
        }

        return result
      } catch (err) {
        if (err instanceof HubError && !err.retryable) throw err

        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < MAX_RETRIES - 1) {
          await this.backoff(attempt)
        }
      }
    }

    throw lastError ?? new Error('Hub request failed after retries')
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
        throw new HubError('HTTP_ERROR', `Hub returned ${res.status}`, true)
      }

      return await res.json() as T
    } catch (err) {
      if (err instanceof HubError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new HubError('TIMEOUT', `Hub timeout after ${TIMEOUT_MS}ms`, true)
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
