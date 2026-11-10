import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { createLeadTag } from '@/services/lead-tags.service'
import { leadTagsQueryKey } from '@/hooks/use-lead-tags'
import type { LeadTag } from '@/types/database'

export const useCreateLeadTag = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id ?? null)

  return useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      createLeadTag(companyId!, { ...input, createdBy: profileId }),
    onSuccess: (tag) => {
      queryClient.setQueryData<LeadTag[]>(leadTagsQueryKey(companyId), (prev) => {
        const list = prev ?? []
        return list.some((t) => t.id === tag.id) ? list : [...list, tag]
      })
    },
    onError: () => {
      toast.error('Não foi possível salvar a cor da tag')
    },
  })
}
