import { veltzy } from '@/lib/supabase'

// Contadores da aba 4: negocios das inscricoes do evento por etapa e por responsavel.
// count exact com head:true (imune ao max_rows); o !inner filtra pelo negocio embutido.

const countBy = async (companyId: string, eventId: string, column: 'stage_id' | 'assigned_to', value: string) => {
  const { count, error } = await veltzy()
    .from('event_registrations')
    .select('id, deals!inner(id)', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('event_id', eventId)
    .eq(`deals.${column}`, value)
  if (error) throw error
  return count ?? 0
}

export const countEventDealsBy = async (
  companyId: string, eventId: string, column: 'stage_id' | 'assigned_to', values: string[],
): Promise<Record<string, number>> => {
  const entries = await Promise.all(values.map(async (v) => [v, await countBy(companyId, eventId, column, v)] as const))
  return Object.fromEntries(entries)
}
