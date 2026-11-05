import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as campaignsService from '@/services/campaigns.service'
import type { AudienceFilter } from '@/types/database'

export const useCampaigns = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => campaignsService.getCampaigns(companyId!),
    enabled: !!companyId,
    staleTime: 15_000,
  })
}

export const useCampaign = (id: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['campaign', companyId, id],
    queryFn: () => campaignsService.getCampaignById(companyId!, id!),
    enabled: !!companyId && !!id,
    staleTime: 15_000,
  })
}

export const useCampaignRecipients = (id: string | undefined) => {
  return useQuery({
    queryKey: ['campaign-recipients', id],
    queryFn: () => campaignsService.getCampaignRecipientsDetailed(id!),
    enabled: !!id,
    staleTime: 10_000,
  })
}

export const useCampaignTemplates = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['campaign-templates', companyId],
    queryFn: () => campaignsService.getTemplates(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  })
}

/** Contagem da audiencia de um filtro (passo "revisar"). Debounce via enabled. */
export const useAudienceCount = (filter: AudienceFilter, enabled = true) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['audience-count', companyId, filter],
    queryFn: () => campaignsService.countAudience(companyId!, filter),
    enabled: !!companyId && enabled,
    staleTime: 5_000,
  })
}

export const useCreateCampaign = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  return useMutation({
    mutationFn: (input: campaignsService.CreateCampaignInput) =>
      campaignsService.createCampaign(companyId!, profileId ?? null, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useDispatchCampaign = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) => campaignsService.dispatchCampaign(campaignId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      if (res?.skipped) {
        toast.warning(
          res.reason === 'cloud_api_proximo_corte'
            ? 'Disparo via Cloud API sera liberado em breve.'
            : 'Disparo em massa nao esta habilitado para esta empresa.',
        )
      } else {
        toast.success(`Campanha enfileirada: ${res?.queued ?? 0} destinatario(s).`)
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useUpdateCampaign = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: campaignsService.CreateCampaignInput }) =>
      campaignsService.updateCampaign(companyId!, id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign', companyId, id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

/** Cancela os envios pendentes e volta a campanha para rascunho (antes de salvar a edição). */
export const useResetCampaign = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) => campaignsService.manageCampaign(campaignId, 'reset'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: () => toast.error('Não foi possível atualizar a campanha. Tente de novo.'),
  })
}

export const useDeleteCampaign = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (campaignId: string) => campaignsService.manageCampaign(campaignId, 'delete'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campanha excluída.')
    },
    onError: () => toast.error('Não foi possível excluir a campanha. Tente de novo.'),
  })
}
