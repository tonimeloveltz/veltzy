// Lógica PURA das métricas de entrega (mkt-ativo Onda 2). Sem DB, sem HMAC — testável
// isolado. O index importa daqui pro ramo statuses[] dos receipts da Cloud API.

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

// Progressão: pending < sent < delivered < read. failed = rank de 'sent' (ver shouldApply).
const RANK: Record<DeliveryStatus, number> = {
  pending: 0,
  sent: 1,
  failed: 1,
  delivered: 2,
  read: 3,
}

/** Normaliza o status cru do receipt da Meta para o enum interno. '' se desconhecido. */
export function mapStatus(metaStatus: string | null | undefined): DeliveryStatus | '' {
  const s = (metaStatus ?? '').toLowerCase()
  if (s === 'sent' || s === 'delivered' || s === 'read' || s === 'failed') return s
  return ''
}

/**
 * Decide se o `next` deve sobrescrever o `current` (progressão monotônica).
 * Regra EXPLÍCITA (ver SPEC/Contratos):
 *   - avanço normal: rank(next) > rank(current)  → sent→delivered→read
 *   - exceção: next==='failed' E current IN ('pending','sent')  (a Meta aceita e depois falha)
 * failed NÃO sobrescreve delivered/read; nada regride (read→delivered/sent = false).
 * current nulo/desconhecido conta como 'pending' (rank 0).
 */
export function shouldApply(current: DeliveryStatus | null | undefined, next: DeliveryStatus): boolean {
  const cur = (current && current in RANK) ? current : 'pending'
  if (RANK[next] > RANK[cur]) return true
  if (next === 'failed' && (cur === 'pending' || cur === 'sent')) return true
  return false
}
