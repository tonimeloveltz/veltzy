import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as prospect from '@/services/prospect.service'
import type { ProspectGroup } from '@/types/database'

export const useProspectConfig = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['prospect-config', companyId],
    queryFn: () => prospect.getConfig(companyId!),
    enabled: !!companyId,
  })
}

export const useProspectGroups = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['prospect-groups', companyId],
    queryFn: () => prospect.getGroups(companyId!),
    enabled: !!companyId,
  })
}

export const useSetCompanyEnabled = () => {
  const qc = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: (isEnabled: boolean) => prospect.setCompanyEnabled(companyId!, isEnabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospect-config'] })
      toast.success('Kill switch atualizado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useRegisterGroup = () => {
  const qc = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: (input: { name: string; invite_code?: string | null; niche?: string | null; session_name: string }) =>
      prospect.registerGroup(companyId!, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospect-groups'] })
      toast.success('Grupo registrado')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useUpdateGroup = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<ProspectGroup, 'is_active' | 'niche' | 'invite_code' | 'name'>> }) =>
      prospect.updateGroup(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospect-groups'] }),
    onError: (err: Error) => toast.error(err.message),
  })
}
