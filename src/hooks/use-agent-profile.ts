import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as agentProfileService from '@/services/agent-profile.service'

export const useAgentProfile = (pipelineId: string | undefined) => {
  return useQuery({
    queryKey: ['agent-profile', pipelineId],
    queryFn: () => agentProfileService.getAgentProfile(pipelineId!),
    enabled: !!pipelineId,
  })
}

export const useAgentProfileById = (id: string | undefined) => {
  return useQuery({
    queryKey: ['agent-profile-by-id', id],
    queryFn: () => agentProfileService.getAgentProfileById(id!),
    enabled: !!id,
  })
}

export const useCreateAgentProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: agentProfileService.createAgentProfile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-profile', data.pipeline_id] })
      queryClient.invalidateQueries({ queryKey: ['agent-profile-by-id'] })
      toast.success('Agent Profile criado com sucesso')
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar Agent Profile: ${err.message}`)
    },
  })
}

export const useUpdateAgentProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof agentProfileService.updateAgentProfile>[1] }) =>
      agentProfileService.updateAgentProfile(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-profile', data.pipeline_id] })
      queryClient.invalidateQueries({ queryKey: ['agent-profile-by-id', data.id] })
      toast.success('Agent Profile atualizado')
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar: ${err.message}`)
    },
  })
}

export const useDeleteAgentProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: agentProfileService.deleteAgentProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-profile'] })
      toast.success('Agent Profile removido')
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover: ${err.message}`)
    },
  })
}

export const useToggleAgentProfileActive = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      agentProfileService.toggleAgentProfileActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-profile'] })
      queryClient.invalidateQueries({ queryKey: ['agent-profile-by-id'] })
    },
    onError: (err: Error) => {
      toast.error(`Erro ao alterar status: ${err.message}`)
    },
  })
}

export const useKnowledgeFiles = (agentProfileId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['knowledge-files', agentProfileId],
    queryFn: () => agentProfileService.getKnowledgeFiles(companyId!, agentProfileId!),
    enabled: !!companyId && !!agentProfileId,
  })
}

export const useDeleteKnowledgeFile = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ agentProfileId, storageKey }: { agentProfileId: string; storageKey: string }) =>
      agentProfileService.deleteKnowledgeFile(companyId!, agentProfileId, storageKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-files'] })
      toast.success('Arquivo removido')
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover arquivo: ${err.message}`)
    },
  })
}
