import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as templatesService from '@/services/reply-templates.service'
import type { ReplyTemplate } from '@/types/database'

export const useReplyTemplates = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['reply-templates', companyId],
    queryFn: () => templatesService.getTemplates(companyId!),
    enabled: !!companyId,
  })
}

export const useCreateTemplate = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: { title: string; content: string; category?: string }) =>
      templatesService.createTemplate(companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reply-templates'] })
      toast.success('Template criado!')
    },
  })
}

export const useUpdateTemplate = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (data: { id: string; input: Partial<Pick<ReplyTemplate, 'title' | 'content' | 'category' | 'is_active'>> }) =>
      templatesService.updateTemplate(companyId!, data.id, data.input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reply-templates'] })
      toast.success('Template atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar template'),
  })
}

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (id: string) => templatesService.deleteTemplate(companyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reply-templates'] })
    },
    onError: () => toast.error('Erro ao deletar template'),
  })
}
