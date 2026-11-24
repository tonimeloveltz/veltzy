/** Prazo padrao de resposta ao lead, em horas (mesmo default de business_rules.sla_hours). */
export const DEFAULT_RESPONSE_SLA_HOURS = 2

/**
 * Converte o sla_hours das regras de negocio em milissegundos.
 * Valor ausente, zero ou invalido cai no padrao de 2h (antes o check-sla caia em 30 min).
 */
export const responseSlaMs = (slaHours: number | null | undefined): number => {
  const hours = Number(slaHours)
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_RESPONSE_SLA_HOURS) * 60 * 60 * 1000
}
