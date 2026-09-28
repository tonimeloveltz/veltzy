import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as pipelinesService from '@/services/pipelines.service'

export const usePipelines = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['pipelines', companyId],
    queryFn: () => pipelinesService.getPipelines(companyId!),
    enabled: !!companyId,
  })
}

export const useDefaultPipeline = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['pipelines', companyId, 'default'],
    queryFn: () => pipelinesService.getDefaultPipeline(companyId!),
    enabled: !!companyId,
  })
}

export const useCreatePipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: { name: string; slug: string; color: string }) =>
      pipelinesService.createPipeline(companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast.success('Pipeline criado com sucesso')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao criar pipeline')
    },
  })
}

export const useUpdatePipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ pipelineId, data }: { pipelineId: string; data: Parameters<typeof pipelinesService.updatePipeline>[2] }) =>
      pipelinesService.updatePipeline(companyId!, pipelineId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar pipeline')
    },
  })
}

export const useDeletePipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (pipelineId: string) =>
      pipelinesService.deletePipeline(companyId!, pipelineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast.success('Pipeline desativado')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao desativar pipeline')
    },
  })
}

export const useInactivePipelines = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  // Prefixo ['pipelines']: criar, desativar e reordenar ja invalidam esta lista.
  return useQuery({
    queryKey: ['pipelines', companyId, 'inactive'],
    queryFn: () => pipelinesService.getInactivePipelines(companyId!),
    enabled: !!companyId,
  })
}

export const useReactivatePipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (pipelineId: string) =>
      pipelinesService.reactivatePipeline(companyId!, pipelineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-deal-counts'] })
      toast.success('Pipeline reativado')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao reativar pipeline')
    },
  })
}

export const useReorderPipelines = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (items: { id: string; position: number }[]) =>
      pipelinesService.reorderPipelines(companyId!, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao reordenar pipelines')
    },
  })
}

export const useSetDefaultPipeline = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (pipelineId: string) =>
      pipelinesService.setDefaultPipeline(companyId!, pipelineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      toast.success('Pipeline padrao atualizado')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao definir pipeline padrao')
    },
  })
}
