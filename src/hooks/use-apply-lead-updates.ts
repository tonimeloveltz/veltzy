import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { invalidateLeadDependentQueries } from '@/lib/query-keys'
import { applyLeadUpdates } from '@/services/import-leads.service'
import type { LeadUpdateSuggestion } from '@/lib/import-lead-updates'

export const useApplyLeadUpdates = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (suggestions: LeadUpdateSuggestion[]) => applyLeadUpdates(companyId!, suggestions),
    onSuccess: ({ updated, failed }) => {
      invalidateLeadDependentQueries(queryClient)
      if (updated > 0) toast.success(`${updated} ${updated === 1 ? 'lead atualizado' : 'leads atualizados'}`)
      if (failed > 0) toast.error(`${failed} ${failed === 1 ? 'lead não pôde ser atualizado' : 'leads não puderam ser atualizados'}`)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar os leads')
    },
  })
}
