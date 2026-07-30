import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import {
  getValidConsent,
  grantConsent,
  revokeConsent,
} from '@/services/lead-consents.service'
import type { ConsentPurpose, GrantConsentInput } from '@/types/lead-consent'

/** Consentimento valido (revogado_em IS NULL) do lead para a finalidade, ou null. */
export function useLeadConsent(leadId: string, finalidade: ConsentPurpose) {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['lead-consent', companyId, leadId, finalidade],
    queryFn: () => getValidConsent(companyId!, leadId, finalidade),
    enabled: !!companyId && !!leadId,
  })
}

export function useGrantConsent() {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: GrantConsentInput) => grantConsent(companyId!, input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['lead-consent', companyId, input.leadId] })
    },
  })
}

export function useRevokeConsent() {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (id: string) => revokeConsent(companyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-consent', companyId] })
    },
  })
}
