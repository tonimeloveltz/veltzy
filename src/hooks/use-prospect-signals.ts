import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as prospect from '@/services/prospect.service'
import type { SignalFilter } from '@/services/prospect.service'

export const useProspectSignals = (filter: SignalFilter) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['prospect-signals', companyId, filter],
    queryFn: () => prospect.getSignals(companyId!, filter),
    enabled: !!companyId,
  })
}

export const useProspectMetrics = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['prospect-metrics', companyId],
    queryFn: () => prospect.getMetrics(companyId!),
    enabled: !!companyId,
  })
}

const invalidateSignals = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['prospect-signals'] })
  qc.invalidateQueries({ queryKey: ['prospect-metrics'] })
}

export const useReviewSignal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ signalId, humanLabel }: { signalId: string; humanLabel: boolean }) =>
      prospect.reviewSignal(signalId, humanLabel),
    onSuccess: () => invalidateSignals(qc),
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useDraftDm = () => {
  return useMutation({
    mutationFn: (signalId: string) => prospect.draftDm(signalId),
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useSendDm = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ signalId, messageText }: { signalId: string; messageText: string }) =>
      prospect.sendDm(signalId, messageText),
    onSuccess: (res) => {
      invalidateSignals(qc)
      if (res?.blocked) toast.warning(`Envio bloqueado: ${res.reason}`)
      else toast.success('DM enviada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export const useApproachSignal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ signalId, phone }: { signalId: string; phone?: string }) =>
      prospect.approachSignal(signalId, phone),
    onSuccess: () => {
      invalidateSignals(qc)
      toast.success('Abordagem registrada')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
