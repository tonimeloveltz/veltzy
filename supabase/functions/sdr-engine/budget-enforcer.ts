/**
 * BudgetEnforcer — Limites multi-camada por conversa/turn.
 * Limite mensal da empresa e validado pelo Hub (LIMIT_EXCEEDED).
 * BudgetEnforcer cuida de: tokens por conversa, iteracoes por turn, tool calls por turn.
 */

const HARD_CAP_ITERATIONS = 15
const MAX_TOOL_CALLS_PER_TURN = 5

// --- Error ---

export class BudgetExceededError extends Error {
  constructor(public readonly reason: string) {
    super(`Budget exceeded: ${reason}`)
    this.name = 'BudgetExceededError'
  }
}

// --- Types ---

interface BudgetLimits {
  maxTokensPerConversation: number
  maxIterationsPerTurn: number
}

interface ConversationState {
  total_tokens_used: number
  current_iteration: number
}

// --- Enforcer ---

export class BudgetEnforcer {
  private readonly maxTokens: number
  private readonly maxIterations: number
  private toolCallsThisTurn = 0

  constructor(limits: BudgetLimits) {
    this.maxTokens = limits.maxTokensPerConversation
    this.maxIterations = Math.min(limits.maxIterationsPerTurn, HARD_CAP_ITERATIONS)
  }

  assertCanContinue(conversation: ConversationState): void {
    if (conversation.total_tokens_used >= this.maxTokens) {
      throw new BudgetExceededError(
        `tokens_per_conversation: ${conversation.total_tokens_used}/${this.maxTokens}`,
      )
    }
    if (conversation.current_iteration >= this.maxIterations) {
      throw new BudgetExceededError(
        `iterations_per_turn: ${conversation.current_iteration}/${this.maxIterations}`,
      )
    }
    if (this.toolCallsThisTurn >= MAX_TOOL_CALLS_PER_TURN) {
      throw new BudgetExceededError(
        `tool_calls_per_turn: ${this.toolCallsThisTurn}/${MAX_TOOL_CALLS_PER_TURN}`,
      )
    }
  }

  consumeToolCall(): void {
    this.toolCallsThisTurn++
  }

  resetTurn(): void {
    this.toolCallsThisTurn = 0
  }
}
