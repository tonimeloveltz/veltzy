/**
 * GuardrailChecker — Validacao pos-LLM antes de enviar resposta ao lead.
 * Onda 1: warnings para preco/prazo, bloqueio para keywords de escalada.
 */

// --- Types ---

interface GuardrailProfile {
  must_escalate_keywords: string[]
  forbidden_topics: string[]
}

export interface GuardrailResult {
  allowed: boolean
  forceEscalate: boolean
  escalateReason: string | null
  warnings: string[]
}

// --- Patterns ---

const PRICE_PATTERN = /R\$\s*\d|reais|BRL/i
const DEADLINE_PATTERN = /\b(em|dentro de|ate|prazo de)\s+\d+\s*(dias?|semanas?|horas?|meses?)\b/i

// --- Checker ---

export class GuardrailChecker {
  private knowledgeQueriedThisTurn = false

  markKnowledgeQueried(): void {
    this.knowledgeQueriedThisTurn = true
  }

  resetTurn(): void {
    this.knowledgeQueriedThisTurn = false
  }

  checkResponse(content: string, profile: GuardrailProfile): GuardrailResult {
    const warnings: string[] = []
    let forceEscalate = false
    let escalateReason: string | null = null

    // 1. Preco sem consulta a knowledge base
    if (PRICE_PATTERN.test(content) && !this.knowledgeQueriedThisTurn) {
      warnings.push('Resposta menciona preco sem consultar knowledge base')
    }

    // 2. Promessa de prazo
    if (DEADLINE_PATTERN.test(content)) {
      warnings.push('Resposta contem promessa de prazo')
    }

    // 3. Keywords de escalada obrigatoria
    if (profile.must_escalate_keywords.length > 0) {
      const contentLower = content.toLowerCase()
      for (const keyword of profile.must_escalate_keywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          forceEscalate = true
          escalateReason = `keyword_escalada: ${keyword}`
          break
        }
      }
    }

    // Log warnings
    for (const w of warnings) {
      console.warn(`[guardrail] ${w}`)
    }

    return {
      allowed: !forceEscalate,
      forceEscalate,
      escalateReason,
      warnings,
    }
  }
}
