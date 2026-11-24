import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { countFieldAnswers } from '@/services/event-form-fields.service'

/** Inscricoes que ja responderam o campo; so consulta quando `enabled` (drawer ou exclusao abertos). */
export const useFieldAnswerCount = (eventId: string, fieldId: string | null, enabled: boolean) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['event-field-answers', eventId, fieldId],
    queryFn: () => countFieldAnswers(companyId!, eventId, fieldId!),
    enabled: enabled && !!companyId && !!fieldId,
    staleTime: 30_000,
  })
}
