// Numero de envio da campanha (SPEC seletor-numero-campanha). Logica PURA e testavel.
// O numero escolhido mora no jsonb anti_ban (sender_instance/sender_force) para nao
// exigir migration; aqui ele e separado do throttle que vai para o blast-schedule.

import type { ThrottleConfig } from './blast-schedule.ts'

const THROTTLE_KEYS = ['delay_min', 'delay_max', 'daily_cap', 'window_start', 'window_end'] as const

export interface SplitAntiBan {
  throttle: ThrottleConfig | null
  sender: string | null
  force: boolean
}

export function splitAntiBan(antiBan: unknown): SplitAntiBan {
  if (!antiBan || typeof antiBan !== 'object') return { throttle: null, sender: null, force: false }
  const raw = antiBan as Record<string, unknown>

  const throttle: ThrottleConfig = {}
  for (const k of THROTTLE_KEYS) {
    if (typeof raw[k] === 'number') throttle[k] = raw[k] as number
  }
  const sender = typeof raw.sender_instance === 'string' && raw.sender_instance.trim() !== ''
    ? raw.sender_instance.trim()
    : null

  return {
    throttle: Object.keys(throttle).length > 0 ? throttle : null,
    sender,
    force: raw.sender_force === true && sender !== null,
  }
}

// Lead mantem o numero da conversa; o escolhido cobre quem nao tem (ou todos, se force).
export function resolveSenderInstance(
  leadInstance: string | null | undefined,
  sender: string | null,
  force: boolean,
): string | null {
  if (force && sender) return sender
  if (leadInstance) return leadInstance
  return sender
}
