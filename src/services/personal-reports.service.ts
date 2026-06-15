import { veltzy as db } from '@/lib/supabase'
import type { PersonalReport } from '@/types/database'

export const getPersonalReport = async (profileId: string, days = 30): Promise<PersonalReport> => {
  const start = new Date()
  start.setDate(start.getDate() - days)

  // Contatos atribuidos no periodo (metrica de contato — segue em leads).
  const { data: leads, error } = await db()
    .from('leads')
    .select('id')
    .eq('assigned_to', profileId)
    .gte('created_at', start.toISOString())
  if (error) throw error

  // Negocios ganhos do vendedor no periodo (migrado de leads para deals).
  // Espelha getSellerPerformance: deals do vendedor por created_at; ganho = won.
  const { data: wonDeals, error: dealsError } = await db()
    .from('deals')
    .select('value')
    .eq('assigned_to', profileId)
    .eq('status', 'won')
    .gte('created_at', start.toISOString())
  if (dealsError) throw dealsError

  const assignedLeads = leads?.length ?? 0
  const dealsClosed = wonDeals?.length ?? 0
  const revenue = (wonDeals ?? []).reduce((s, d) => s + (Number(d.value) || 0), 0)

  return {
    assigned_leads: assignedLeads,
    deals_closed: dealsClosed,
    conversion_rate: assignedLeads > 0 ? Math.round((dealsClosed / assignedLeads) * 1000) / 10 : 0,
    avg_response_time: null,
    revenue,
  }
}
