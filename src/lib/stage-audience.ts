// Segmentação por etapa no FRONT (espelha _shared/blast-audience.ts do backend).
// Necessário porque a contagem ao vivo do wizard (countAudience) roda no front e
// precisa bater com o que a edge blast-dispatch dispara (critério A estrito: deal
// ABERTO mais recente por lead está no stage).

export interface OpenDealRow {
  lead_id: string
  stage_id: string | null
  created_at: string
}

/** lead_ids cujo deal ABERTO mais recente está em stageIds. Caller passa só status='open'. */
export function leadIdsInStages(deals: OpenDealRow[], stageIds: string[]): string[] {
  const latestByLead = new Map<string, { stage_id: string | null; created_at: string }>()
  for (const d of deals) {
    const cur = latestByLead.get(d.lead_id)
    if (!cur || d.created_at > cur.created_at) {
      latestByLead.set(d.lead_id, { stage_id: d.stage_id, created_at: d.created_at })
    }
  }
  const wanted = new Set(stageIds)
  const out: string[] = []
  for (const [leadId, v] of latestByLead) {
    if (v.stage_id && wanted.has(v.stage_id)) out.push(leadId)
  }
  return out
}
