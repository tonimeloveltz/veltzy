import type { DealWithLead } from '@/types/database'

// Lista operacional de Negocios: negocios abertos sao trabalho ativo e aparecem
// sempre, independente do periodo selecionado. Fechados (won/lost) filtram por
// closed_at dentro do range. "Total" (days indefinido) mostra tudo.
// Difere de proposito do dashboard, que mede entradas do periodo por created_at.
export const filterByPeriod = (deals: DealWithLead[], days: number | undefined) => {
  if (!days) return deals
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return deals.filter((d) => {
    if (d.status === 'open' || d.status === 'pending_assignment') return true
    if (!d.closed_at) return false
    return new Date(d.closed_at) >= cutoff
  })
}
