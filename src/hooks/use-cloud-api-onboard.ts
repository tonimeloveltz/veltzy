import { useMutation, useQueryClient } from '@tanstack/react-query'
import { onboardCloudApiNumber, type OnboardPayload } from '@/services/cloud-api-onboard.service'

/**
 * Mutation do onboarding oficial. A UI trata os estados/copy (cancelado,
 * conflito, erro), entao o hook nao dispara toast aqui.
 */
export function useCloudApiOnboard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: OnboardPayload) => onboardCloudApiNumber(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-api-numbers'] })
    },
  })
}
