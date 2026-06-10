import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { toast } from 'sonner'
import * as leadsService from '@/services/leads.service'
import * as dealsService from '@/services/deals.service'
import { exportToCsv, exportToPdf, exportToXlsx } from '@/lib/export-leads'
import type { LeadWithDetails } from '@/types/database'

export const useBulkTransfer = (onSuccess?: () => void) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadIds, targetUserId }: { leadIds: string[]; targetUserId: string }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      await leadsService.bulkUpdateAssignedTo(companyId, leadIds, targetUserId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Leads transferidos com sucesso')
      onSuccess?.()
    },
    onError: () => {
      toast.error('Erro ao transferir leads')
    },
  })
}

export const useBulkTransferDeals = (onSuccess?: () => void) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ dealIds, targetUserId }: { dealIds: string[]; targetUserId: string }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      await dealsService.bulkUpdateAssignedTo(companyId, dealIds, targetUserId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Negócios transferidos com sucesso')
      onSuccess?.()
    },
    onError: () => {
      toast.error('Erro ao transferir negócios')
    },
  })
}

export const useBulkArchive = (onSuccess?: () => void) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadIds }: { leadIds: string[] }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      await leadsService.bulkArchive(companyId, leadIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Leads arquivados com sucesso')
      onSuccess?.()
    },
    onError: () => {
      toast.error('Erro ao arquivar leads')
    },
  })
}

export const useBulkDelete = (onSuccess?: () => void) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadIds }: { leadIds: string[] }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      if (!user?.id) throw new Error('Usuario nao encontrado')
      await leadsService.bulkDelete(companyId, leadIds, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Leads excluidos permanentemente')
      onSuccess?.()
    },
    onError: () => {
      toast.error('Erro ao excluir leads')
    },
  })
}

export const useBulkMovePipeline = (onSuccess?: () => void) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadIds, targetPipelineId }: { leadIds: string[]; targetPipelineId: string }) => {
      if (!companyId) throw new Error('Empresa nao encontrada')
      await leadsService.bulkMoveToPipeline(companyId, leadIds, targetPipelineId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Leads movidos para o pipeline com sucesso')
      onSuccess?.()
    },
    onError: () => {
      toast.error('Erro ao mover leads de pipeline')
    },
  })
}

export const useBulkExport = () => {
  return {
    exportCsv: (leads: LeadWithDetails[]) => {
      exportToCsv(leads, `leads-selecionados-${Date.now()}.csv`)
      toast.success(`${leads.length} leads exportados em CSV`)
    },
    exportXlsx: (leads: LeadWithDetails[]) => {
      exportToXlsx(leads, `leads-selecionados-${Date.now()}.xlsx`)
      toast.success(`${leads.length} leads exportados em Excel`)
    },
    exportPdf: (leads: LeadWithDetails[]) => {
      exportToPdf(leads, `leads-selecionados-${Date.now()}.pdf`)
      toast.success(`${leads.length} leads exportados em PDF`)
    },
  }
}
