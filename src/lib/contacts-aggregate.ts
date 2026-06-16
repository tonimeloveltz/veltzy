// Agrega negocios por contato para a pagina Contatos: contagem de deals e
// LTV (soma de deals.value) por lead_id. Agregacao no cliente sobre os deals
// ja lidos da empresa (mesma forma usada no export) - sem RPC nem schema novo.

export interface DealAggregate {
  count: number
  ltv: number
}

export const aggregateDealsByLead = (
  deals: { lead_id: string; value: number | null }[],
): Map<string, DealAggregate> => {
  const map = new Map<string, DealAggregate>()
  for (const d of deals) {
    const cur = map.get(d.lead_id) ?? { count: 0, ltv: 0 }
    cur.count += 1
    cur.ltv += d.value ?? 0
    map.set(d.lead_id, cur)
  }
  return map
}
