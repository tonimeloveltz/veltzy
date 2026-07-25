import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getLeadById } from '@/services/leads.service'

/**
 * Detalhe de um lead, usado para semear o formulario do EditLeadModal.
 *
 * A key vive dentro do namespace ['leads', ...] de proposito: e o que faz o
 * invalidateQueries({ queryKey: ['leads'] }) do useUpdateLead alcancar esta
 * query por prefix match. Fora do namespace, o modal reabre semeado com o lead
 * pre-edicao e o submit grava os valores velhos por cima.
 */
export const useLeadDetail = (leadId?: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['leads', 'detail', companyId, leadId],
    queryFn: () => getLeadById(companyId!, leadId!),
    enabled: !!companyId && !!leadId,
  })
}
