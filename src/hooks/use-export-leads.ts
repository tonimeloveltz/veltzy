import { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useTeamMembers } from '@/hooks/use-team'
import * as leadsService from '@/services/leads.service'
import * as dealsService from '@/services/deals.service'
import { exportToCsv, exportToPdf, exportToXlsx, type ExportLeadRow } from '@/lib/export-leads'

/**
 * Hook para exportar TODOS os leads sem limite de paginação.
 * Aceita pipelineId opcional para filtrar por pipeline.
 */
export const useExportLeads = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const { data: members } = useTeamMembers()
  const [isExporting, setIsExporting] = useState(false)

  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))

  const fetchAllLeads = async (pipelineId?: string | null): Promise<ExportLeadRow[]> => {
    if (!companyId) return []

    const [leads, deals] = await Promise.all([
      leadsService.getLeadsByCompany(companyId, {
        pipelineId: pipelineId ?? undefined,
        assignedTo: isSeller ? profileId : undefined,
        limit: 0, // sem limite
      }),
      dealsService.getDealsByCompany(companyId, {
        pipelineId: pipelineId ?? undefined,
        assignedTo: isSeller ? profileId : undefined,
        limit: 0, // sem limite
      }),
    ])

    const profileMap = new Map(
      members?.map((m) => [m.id, { id: m.id, name: m.name, email: m.email }]) ?? []
    )

    // value/status do export vem do deal: pega o deal MAIS RECENTE de cada lead.
    const dealByLead = new Map<string, NonNullable<ExportLeadRow['deal']>>()
    const latestAt = new Map<string, string>()
    for (const d of deals) {
      const prev = latestAt.get(d.lead_id)
      if (!prev || d.created_at > prev) {
        latestAt.set(d.lead_id, d.created_at)
        dealByLead.set(d.lead_id, { value: d.value, status: d.status })
      }
    }

    return leads.map((lead) => ({
      ...lead,
      profiles: lead.assigned_to ? profileMap.get(lead.assigned_to) ?? null : null,
      deal: dealByLead.get(lead.id) ?? null,
    }))
  }

  const doExport = async (
    format: 'csv' | 'xlsx' | 'pdf',
    pipelineId?: string | null,
    filename?: string,
  ) => {
    setIsExporting(true)
    try {
      const leads = await fetchAllLeads(pipelineId)
      if (leads.length === 0) {
        toast.error('Nenhum lead para exportar')
        return
      }
      const name = filename ?? `leads-${Date.now()}`
      if (format === 'csv') exportToCsv(leads, `${name}.csv`)
      else if (format === 'xlsx') exportToXlsx(leads, `${name}.xlsx`)
      else await exportToPdf(leads, `${name}.pdf`)
      toast.success(`${leads.length} leads exportados com sucesso`)
    } catch {
      toast.error('Erro ao exportar leads')
    } finally {
      setIsExporting(false)
    }
  }

  return { doExport, isExporting }
}
