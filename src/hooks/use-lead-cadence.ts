import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as cadenceService from '@/services/lead-contact-events.service'

/**
 * PONTO UNICO da chave da cadencia.
 *
 * Tres consumidores dependem dela: este hook, a invalidacao das mutations e o
 * fetchQuery do gatilho do aviso. Montada a mao em qualquer um dos tres, vira
 * cache orfao -- a query existe, a invalidacao nao a alcanca, e a linha do
 * tempo fica velha sem erro nenhum aparecer.
 */
export const cadenceQueryKey = (companyId: string | undefined, leadId: string | null) =>
  ['cadence', companyId, leadId] as const

export const useLeadCadence = (leadId: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: cadenceQueryKey(companyId, leadId),
    queryFn: () => cadenceService.getContactEvents(companyId!, leadId!),
    enabled: !!companyId && !!leadId,
    staleTime: 30 * 1000,
  })
}

export const useCreateContactEvent = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)

  // Sem update otimista: e um clique com resposta rapida, e INSERT nao colide.
  // O rollback nao pagaria a complexidade.
  return useMutation({
    mutationFn: ({ leadId }: { leadId: string }) =>
      cadenceService.createContactEvent(companyId!, {
        leadId,
        registeredBy: profileId ?? null,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: cadenceQueryKey(companyId, variables.leadId) })
    },
    onError: () => {
      toast.error('Erro ao registrar contato')
    },
  })
}

export const useDeleteContactEvent = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  // `leadId` vem junto do `eventId` por necessidade: o service so precisa do
  // eventId, mas sem o leadId a mutation nao tem como montar a chave para
  // invalidar, e a entrada apagada fica na tela.
  return useMutation({
    mutationFn: ({ eventId }: { eventId: string; leadId: string }) =>
      cadenceService.deleteContactEvent(companyId!, eventId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: cadenceQueryKey(companyId, variables.leadId) })
    },
    onError: () => {
      toast.error('Erro ao remover contato')
    },
  })
}
