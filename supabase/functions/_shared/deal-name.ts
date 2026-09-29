// Nome (título) do negócio auto-criado no inbound. Deriva do CONTATO, nunca do nome
// da PIPELINE — pipeline.name é mutável (rename não propaga pro deals.name congelado,
// causando rótulo velho no kanban/inbox). Espelha o instagram-webhook
// (`Negocio - ${senderName}` : 'Negocio'). Lógica pura e testável.

export function buildDealName(contactName: string | null | undefined): string {
  const n = typeof contactName === 'string' ? contactName.trim() : ''
  return n ? `Negocio - ${n}` : 'Negocio'
}
