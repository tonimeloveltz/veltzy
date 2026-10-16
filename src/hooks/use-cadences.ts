import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as cadencesService from '@/services/cadences.service'

export const useCadences = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['cadences', companyId],
    queryFn: () => cadencesService.getCadences(companyId!),
    enabled: !!companyId,
    staleTime: 15_000,
  })
}

export const useCadenceRuns = (cadenceId: string | null) => {
  return useQuery({
    queryKey: ['cadence-runs', cadenceId],
    queryFn: () => cadencesService.getCadenceRuns(cadenceId!),
    enabled: !!cadenceId,
    staleTime: 10_000,
  })
}

export const useCadenceSteps = (cadenceId: string | null) => {
  return useQuery({
    queryKey: ['cadence-steps', cadenceId],
    queryFn: () => cadencesService.getCadenceSteps(cadenceId!),
    enabled: !!cadenceId,
    staleTime: 0,
  })
}

export const useCreateCadence = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  return useMutation({
    mutationFn: (input: cadencesService.CreateCadenceInput) =>
      cadencesService.createCadence(companyId!, profileId ?? null, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadences'] })
      toast.success('Cadência criada!')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useUpdateCadence = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: cadencesService.UpdateCadenceInput }) =>
      cadencesService.updateCadence(companyId!, id, input),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['cadences'] })
      queryClient.invalidateQueries({ queryKey: ['cadence-steps', id] })
      toast.success('Automação atualizada!')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useToggleCadence = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      cadencesService.setCadenceEnabled(id, isEnabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useAddLeadsToCadence = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: ({ cadenceId, leadIds }: { cadenceId: string; leadIds: string[] }) =>
      cadencesService.addLeadsToCadence(companyId!, cadenceId, leadIds),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['cadence-runs'] })
      toast.success(`${count} lead(s) inscrito(s) na cadência.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
