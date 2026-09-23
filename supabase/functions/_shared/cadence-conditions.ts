// Avaliação de condições do START por-evento da cadência. Lógica PURA (testável),
// espelha o formato de automation_rules.conditions ({field, operator, value}) SEM
// acoplar ao run-automations (que fica intacto). Todas as condições precisam passar
// (AND); lista vazia = passa (cadência sem filtro dispara pra todo lead do evento).

export interface CadenceCondition {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in'
  value: unknown
}

function evalOne(c: CadenceCondition, lead: Record<string, unknown>): boolean {
  const v = lead[c.field]
  switch (c.operator) {
    case 'eq': return v === c.value
    case 'neq': return v !== c.value
    case 'gt': return Number(v) > Number(c.value)
    case 'lt': return Number(v) < Number(c.value)
    case 'contains': return String(v ?? '').includes(String(c.value))
    case 'in': return Array.isArray(c.value) && (c.value as unknown[]).includes(v)
    default: return false
  }
}

export function leadMatchesConditions(
  conditions: CadenceCondition[] | null | undefined,
  lead: Record<string, unknown>,
): boolean {
  const list = Array.isArray(conditions) ? conditions : []
  return list.every((c) => evalOne(c, lead))
}
