import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useRoles } from '@/hooks/use-roles'
import { usePipelines } from '@/hooks/use-pipelines'
import * as pipelineAccessService from '@/services/pipeline-access.service'
import type { Pipeline } from '@/types/database'

/**
 * Busca os pipeline_ids que um usuario especifico tem acesso.
 * Usado pelo admin para configurar acessos de um vendedor.
 */
export const usePipelineAccessFor = (userId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['pipeline-access', companyId, userId],
    queryFn: () => pipelineAccessService.getPipelineAccess(companyId!, userId!),
    enabled: !!companyId && !!userId,
  })
}

/**
 * Salva a allowlist de pipelines de um vendedor.
 */
export const useSetPipelineAccess = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ userId, pipelineIds }: { userId: string; pipelineIds: string[] }) =>
      pipelineAccessService.setPipelineAccess(companyId!, userId, pipelineIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-access', companyId, variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['accessible-pipelines'] })
      toast.success('Acesso a pipelines atualizado')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar acesso a pipelines')
    },
  })
}

/**
 * Retorna os pipelines acessiveis pelo usuario logado.
 * - Admin/Manager: todos
 * - Seller/Representative: filtrados pela allowlist (sem linhas = todos)
 */
export const useAccessiblePipelines = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const userId = useAuthStore((s) => s.user?.id)
  const { isManager } = useRoles()

  const pipelinesQuery = usePipelines()

  const accessQuery = useQuery({
    queryKey: ['accessible-pipelines', companyId, userId],
    queryFn: () => pipelineAccessService.getPipelineAccess(companyId!, userId!),
    enabled: !!companyId && !!userId && !isManager,
  })

  const allPipelines = pipelinesQuery.data
  let filteredPipelines: Pipeline[] | undefined

  if (allPipelines) {
    if (isManager) {
      // Admin/Manager: ve tudo
      filteredPipelines = allPipelines
    } else if (!accessQuery.data || accessQuery.data.length === 0) {
      // Sem restricao: ve tudo (default permissivo)
      filteredPipelines = allPipelines
    } else {
      // Filtrado pela allowlist
      const allowedSet = new Set(accessQuery.data)
      filteredPipelines = allPipelines.filter((p) => allowedSet.has(p.id))
    }
  }

  return {
    ...pipelinesQuery,
    data: filteredPipelines,
    isLoading: pipelinesQuery.isLoading || (!isManager && accessQuery.isLoading),
  }
}
