// Motor de decisão da cadência (drip) — mkt-ativo Corte B. Lógica PURA e testável:
// dado o estado de um run + seus passos + sinais (lead respondeu / opt-out / stage
// mudou), decide a PRÓXIMA ação. Sem Supabase, sem relógio implícito (now entra por
// parâmetro). O process-cadences (cron) aplica a decisão (enfileira msg, muda tag/stage,
// agenda next_run_at, cancela ou finaliza).

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export interface CadenceStepLite {
  action_type: 'send_message' | 'send_template' | 'wait' | 'add_tag' | 'remove_tag' | 'change_stage' | 'generate_ai'
  config: Record<string, unknown>
}
export interface CadenceRunLite {
  current_step: number
}
export interface CadenceSignals {
  optOut: boolean
  leadResponded: boolean
  stageChanged: boolean
}
export type CancelReason = 'opt_out' | 'lead_responded' | 'stage_changed'

export type CadenceDecision =
  | { kind: 'cancel'; reason: CancelReason }
  | { kind: 'complete' }
  | { kind: 'wait'; nextStep: number; nextRunAt: string }
  | { kind: 'execute'; step: CadenceStepLite; nextStep: number; nextRunAt: string }

/**
 * Decide a ação para um run de cadência.
 * Precedência de cancelamento: opt-out > lead respondeu > mudança de stage (configurável).
 * opt-out e resposta são SEMPRE cancelantes; stage só se cancelOnStageChange.
 */
export function decideCadenceAction(
  run: CadenceRunLite,
  steps: CadenceStepLite[],
  signals: CadenceSignals,
  opts: { cancelOnStageChange: boolean; now: Date },
): CadenceDecision {
  if (signals.optOut) return { kind: 'cancel', reason: 'opt_out' }
  if (signals.leadResponded) return { kind: 'cancel', reason: 'lead_responded' }
  if (signals.stageChanged && opts.cancelOnStageChange) return { kind: 'cancel', reason: 'stage_changed' }

  if (run.current_step >= steps.length) return { kind: 'complete' }

  const step = steps[run.current_step]
  const nextStep = run.current_step + 1

  if (step.action_type === 'wait') {
    const days = Number(step.config.days ?? 0)
    const hours = Number(step.config.hours ?? 0)
    const nextRunAt = new Date(opts.now.getTime() + days * DAY_MS + hours * HOUR_MS).toISOString()
    return { kind: 'wait', nextStep, nextRunAt }
  }

  // Ação imediata: executa agora; o próximo passo é elegível já (o cron pega no próximo tick).
  return { kind: 'execute', step, nextStep, nextRunAt: opts.now.toISOString() }
}
