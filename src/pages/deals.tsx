import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Clock, Calendar, CalendarDays, BarChart3,
  DollarSign, Users, TrendingUp, Plus, MessageSquare, Download, Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { leadDisplayName } from '@/lib/phone'
import { filterByPeriod } from '@/lib/deals-period-filter'
import { useDashboardDeals } from '@/hooks/use-deals'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { useRoles } from '@/hooks/use-roles'
import { PipelineFilter } from '@/components/shared/pipeline-filter'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewDealModal } from '@/components/deals/new-deal-modal'
import { EditLeadModal } from '@/components/pipeline/edit-lead-modal'
import { ImportLeadsModal } from '@/components/pipeline/import-leads-modal'
import { BulkActionBar } from '@/components/deals/bulk-action-bar'
import { exportToCsv, exportToPdf, exportToXlsx } from '@/lib/export-leads'
import type { DealStatus, LeadTemperature } from '@/types/database'
import { getLeadById } from '@/services/leads.service'
import { useAuthStore } from '@/stores/auth.store'
import { useQuery } from '@tanstack/react-query'

const periodOptions = [
  { label: 'Hoje', icon: Clock, days: 1 },
  { label: 'Semana', icon: Calendar, days: 7 },
  { label: 'Mes', icon: CalendarDays, days: 30 },
  { label: 'Total', icon: BarChart3, days: undefined },
] as const

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const tempConfig: Record<LeadTemperature, { label: string; dotColor: string }> = {
  cold: { label: 'Frio', dotColor: 'bg-blue-400' },
  warm: { label: 'Morno', dotColor: 'bg-yellow-500' },
  hot:  { label: 'Quente', dotColor: 'bg-orange-500' },
  fire: { label: 'Pegando Fogo', dotColor: 'bg-red-500' },
}

const statusConfig: Record<DealStatus, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'text-yellow-500' },
  won: { label: 'Fechado', color: 'text-emerald-500' },
  lost: { label: 'Perdido', color: 'text-red-500' },
  archived: { label: 'Arquivado', color: 'text-muted-foreground' },
  pending_assignment: { label: 'Aberto', color: 'text-yellow-500' },
}

const thClass = 'pb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider'

const DealsPage = () => {
  const navigate = useNavigate()
  const companyId = useAuthStore((s) => s.company?.id)
  const { roles, isAdmin, isManager } = useRoles()
  const userRole = roles[0] ?? 'seller'

  const [selectedDays, setSelectedDays] = useState<number | undefined>(30)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)

  const { data: pipelines } = useAccessiblePipelines()
  const { data: allDeals, isLoading, isError, refetch } = useDashboardDeals(selectedPipelineId, showArchived)
  const { data: stages } = usePipelineStages()

  // Fetch lead for edit modal
  const { data: selectedLeadData } = useQuery({
    queryKey: ['lead-for-edit', selectedLeadId, companyId],
    queryFn: () => getLeadById(companyId!, selectedLeadId!),
    enabled: !!selectedLeadId && !!companyId,
  })

  const pipelineMap = new Map((pipelines ?? []).map((p) => [p.id, p]))
  const periodDeals = filterByPeriod(allDeals ?? [], selectedDays)

  const deals = useMemo(() => {
    if (showArchived) return periodDeals
    return periodDeals.filter((d) => d.status !== 'archived')
  }, [periodDeals, showArchived])

  const openDeals = deals.filter((d) => d.status === 'open' || d.status === 'pending_assignment')
  const closedDeals = deals.filter((d) => d.status === 'won')
  const lostDeals = deals.filter((d) => d.status === 'lost')

  const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const openValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const closedValue = closedDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const lostValue = lostDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)
  const avgTicket = closedDeals.length > 0 ? closedValue / closedDeals.length : 0

  const stageMap = new Map(stages?.map((s) => [s.id, s]) ?? [])

  const cardBase = 'bg-card border border-border/30 rounded-2xl p-5'

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === deals.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(deals.map((d) => d.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const allSelected = deals.length > 0 && selectedIds.size === deals.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < deals.length

  // Convert deals to lead-like objects for BulkActionBar + export compatibility
  const dealsAsLeads = useMemo(() => {
    return deals.map((d) => ({
      ...(d.leads ?? {}),
      id: d.id,
      company_id: d.company_id,
      pipeline_id: d.pipeline_id ?? '',
      stage_id: d.stage_id ?? '',
      deal_value: d.value,
      assigned_to: d.assigned_to,
      profiles: d.profiles,
    }))
  }, [deals])

  return (
    <div className="min-h-full p-6">
      <div className="space-y-6 animate-fade-in">

        {/* HEADER */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Negocios</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gestao completa de negocios e oportunidades
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PipelineFilter
              value={selectedPipelineId}
              onChange={setSelectedPipelineId}
              pipelines={pipelines ?? []}
            />
            <div className="flex gap-1.5">
              {periodOptions.map((p) => {
                const active = selectedDays === p.days
                return (
                  <button
                    key={p.label}
                    onClick={() => setSelectedDays(p.days)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-smooth',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <p.icon className="h-4 w-4" />
                    {p.label}
                  </button>
                )
              })}
            </div>
            {(isAdmin || isManager) && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportModalOpen(true)} title="Importar leads">
                <Download className="h-4 w-4" />
                Importar
              </Button>
            )}
            {deals.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" title="Exportar negocios">
                    <Upload className="h-4 w-4" />
                    Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportToCsv(dealsAsLeads as never)}>
                    Exportar CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToXlsx(dealsAsLeads as never)}>
                    Exportar Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToPdf(dealsAsLeads as never)}>
                    Exportar PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo Negocio
            </Button>
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedIds.size > 0 && (
          <BulkActionBar
            selectedIds={selectedIds}
            leads={dealsAsLeads as never}
            onClear={clearSelection}
            userRole={userRole}
            mode="deals"
          />
        )}

        {/* KPI CARDS */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border/30 rounded-2xl p-5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-20 mt-3" />
                <Skeleton className="h-px w-full my-3" />
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((j) => <Skeleton key={j} className="h-8 w-full" />)}
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 bg-card border border-border/30 rounded-2xl">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Erro ao carregar negocios</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className={cardBase}>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total de Negocios</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground mt-2">{deals.length}</p>
            <div className="border-t border-border/30 my-3" />
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-yellow-500">{openDeals.length}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle bg-yellow-500" />
                  Aberto
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-emerald-500">{closedDeals.length}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle bg-emerald-500" />
                  Fechado
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-red-500">{lostDeals.length}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle bg-red-500" />
                  Perdido
                </span>
              </div>
            </div>
          </div>

          <div className={cardBase}>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Ticket Medio</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground mt-2">{fmt(avgTicket)}</p>
          </div>

          <div className={cardBase}>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Valor Total</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold text-primary mt-2">{fmt(totalValue)}</p>
            <div className="border-t border-border/30 my-3" />
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-yellow-500">{fmt(openValue)}</span>
                <span className="text-xs text-muted-foreground">Aberto</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-emerald-500">{fmt(closedValue)}</span>
                <span className="text-xs text-muted-foreground">Fechado</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-red-500">{fmt(lostValue)}</span>
                <span className="text-xs text-muted-foreground">Perdido</span>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* TABELA */}
        <div className="glass-card rounded-xl p-5">
          {(isAdmin || isManager) && (
            <div className="flex items-center gap-2 mb-4 justify-end">
              <span className="text-sm text-muted-foreground">Mostrar arquivados</span>
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className={cn(thClass, 'text-left w-[3%]')}>
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className={cn(thClass, 'text-left w-[14%]')}>Contato</th>
                  <th className={cn(thClass, 'text-left w-[10%]')}>Empresa</th>
                  <th className={cn(thClass, 'text-left w-[4%]')}>Chat</th>
                  <th className={cn(thClass, 'text-left w-[11%]')}>Negocio</th>
                  <th className={cn(thClass, 'text-left w-[8%]')}>Valor</th>
                  <th className={cn(thClass, 'text-left w-[8%]')}>Pipeline</th>
                  <th className={cn(thClass, 'text-left w-[8%]')}>Etapa</th>
                  <th className={cn(thClass, 'text-left w-[7%]')}>Status</th>
                  <th className={cn(thClass, 'text-left w-[7%]')}>Temperatura</th>
                  <th className={cn(thClass, 'text-left w-[8%]')}>Responsavel</th>
                  <th className={cn(thClass, 'text-left w-[8%]')}>Criado em</th>
                  <th className={cn(thClass, 'text-left w-[8%]')}>Fechado em</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const lead = deal.leads
                  const stage = deal.stage_id ? stageMap.get(deal.stage_id) : null
                  const temp = lead ? tempConfig[lead.temperature] : null
                  const initials = lead?.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() ?? '?'
                  const assignedName = (deal.profiles as { name?: string } | null)?.name
                  const isSelected = selectedIds.has(deal.id)
                  const status = statusConfig[deal.status]

                  return (
                    <tr
                      key={deal.id}
                      onClick={() => setSelectedLeadId(deal.lead_id)}
                      className={cn(
                        'border-b border-border/10 last:border-0 hover:bg-muted/20 transition-smooth cursor-pointer',
                        isSelected && 'bg-primary/5',
                        deal.status === 'archived' && 'opacity-60'
                      )}
                    >
                      <td className="py-3 text-left" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(deal.id)}
                        />
                      </td>

                      {/* Contato */}
                      <td className="py-3 text-left">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7">
                            {lead?.avatar_url ? (
                              <img src={lead.avatar_url} alt={lead?.name ?? ''} className="h-full w-full rounded-full object-cover" />
                            ) : (
                              <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{initials}</AvatarFallback>
                            )}
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{leadDisplayName(lead?.name, lead?.phone ?? '')}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{lead?.phone}</p>
                          </div>
                        </div>
                      </td>

                      {/* Empresa */}
                      <td className="py-3 text-left text-xs text-muted-foreground truncate">
                        {lead?.company_name || <span className="text-muted-foreground/40">-</span>}
                      </td>

                      {/* Chat */}
                      <td className="py-3 text-left">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/inbox?lead=${deal.lead_id}`) }}
                          className="inline-flex items-center text-muted-foreground hover:text-primary transition-smooth cursor-pointer"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </td>

                      {/* Negocio */}
                      <td className="py-3 text-left">
                        <p className="text-xs font-medium truncate">
                          {deal.name ? deal.name : <span className="text-muted-foreground">-</span>}
                        </p>
                      </td>

                      {/* Valor */}
                      <td className={cn('py-3 text-left font-semibold', deal.status === 'won' ? 'text-emerald-500' : 'text-primary')}>
                        {deal.value ? fmt(deal.value) : '-'}
                      </td>

                      {/* Pipeline */}
                      {(() => {
                        const pipeline = deal.pipeline_id ? pipelineMap.get(deal.pipeline_id) : null
                        return (
                          <td className="py-3 text-left">
                            {pipeline ? (
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: pipeline.color }} />
                                {pipeline.name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        )
                      })()}

                      {/* Etapa */}
                      <td className="py-3 text-left">
                        {stage && (
                          deal.status === 'won' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs rounded-full bg-emerald-500/15 text-emerald-500 px-2 py-0.5 font-medium">
                              <span className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                              {stage.name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                              {stage.name}
                            </span>
                          )
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 text-left">
                        <span className={cn('text-xs font-medium', status.color)}>
                          {status.label}
                        </span>
                      </td>

                      {/* Temperatura (compacta) */}
                      <td className="py-3 text-left">
                        {temp && (
                          <span className="inline-flex items-center gap-1 text-[10px]" title={temp.label}>
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', temp.dotColor)} />
                            {temp.label}
                          </span>
                        )}
                      </td>

                      {/* Responsavel */}
                      <td className="py-3 text-left text-xs">
                        {assignedName ?? <span className="text-muted-foreground/40">Sem responsavel</span>}
                      </td>

                      {/* Criado em */}
                      <td className="py-3 text-left text-xs text-muted-foreground">
                        {new Date(deal.created_at).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Fechado em */}
                      <td className="py-3 text-left text-xs text-muted-foreground">
                        {(deal.status === 'won' || deal.status === 'lost') && deal.closed_at
                          ? new Date(deal.closed_at).toLocaleDateString('pt-BR')
                          : <span className="text-muted-foreground/40">-</span>}
                      </td>
                    </tr>
                  )
                })}
                {deals.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-sm text-muted-foreground">
                      Nenhum negocio encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <NewDealModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      <ImportLeadsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />

      <EditLeadModal
        lead={selectedLeadData ?? null}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  )
}

export default DealsPage
