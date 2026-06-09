import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as dealsService from '@/services/deals.service'

export const useBulkMoveDealsPipeline = (onSuccess?: () => void) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ dealIds, targetPipelineId }: { dealIds: string[]; targetPipelineId: string }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      await dealsService.bulkMoveToPipeline(companyId, dealIds, targetPipelineId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Negocios movidos com sucesso!')
      onSuccess?.()
    },
    onError: () => toast.error('Erro ao mover negocios de pipeline'),
  })
}
