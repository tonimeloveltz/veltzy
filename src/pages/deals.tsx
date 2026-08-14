import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, Clock, Calendar, CalendarDays, BarChart3,
  DollarSign, Users, TrendingUp, Plus, MessageSquare, Download, Upload, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { leadDisplayName } from '@/lib/phone'
import { filterByPeriod } from '@/lib/deals-period-filter'
import { useDashboardDeals } from '@/hooks/use-deals'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { useRoles } from '@/hooks/use-roles'
import { PipelineFilter } from '@/components/shared/pipeline-filter'
import { IdentityCell } from '@/components/shared/identity-cell'
import { Breakdown } from '@/components/shared/breakdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { dealStatusConfig, leadTemperatureConfig } from '@/lib/lead-config'
import type { DealStatus } from '@/types/database'
import { useLeadDetail } from '@/hooks/use-lead-detail'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

const periodOptions = [
  { label: 'Hoje', icon: Clock, days: 1 },
  { label: 'Semana', icon: Calendar, days: 7 },
  { label: 'Mes', icon: CalendarDays, days: 30 },
  { label: 'Total', icon: BarChart3, days: undefined },
] as const

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

// Cor do valor monetario por status: Fechado verde, Perdido vermelho (mesmo
// token do label), demais neutro (igual ao nome do negocio).
const dealValueColor: Record<DealStatus, string> = {
  open: 'text-foreground',
  won: 'text-emerald-500',
  lost: 'text-red-500',
  archived: 'text-foreground',
  pending_assignment: 'text-foreground',
}

const thClass = 'pb-3 px-2 first:pl-0 last:pr-0 text-xs font-medium text-muted-foreground'

const tdClass = 'py-3 px-2 first:pl-0 last:pr-0 text-left'

const DealsPage = () => {
  const navigate = useNavigate()
  const { roles, isAdmin, isManager } = useRoles()
  const userRole = roles[0] ?? 'seller'

  const [selectedDays, setSelectedDays] = useState<number | undefined>(30)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)

  const { data: pipelines } = useAccessiblePipelines()
  const { data: allDeals, isLoading, isError, refetch } = useDashboardDeals(selectedPipelineId, showArchived)
  const { data: stages } = usePipelineStages()

  // Fetch lead for edit modal
  const { data: selectedLeadData } = useLeadDetail(selectedLeadId)

  const pipelineMap = new Map((pipelines ?? []).map((p) => [p.id, p]))
  const periodDeals = filterByPeriod(allDeals ?? [], selectedDays)

  const deals = useMemo(() => {
    if (showArchived) return periodDeals
    return periodDeals.filter((d) => d.status !== 'archived')
  }, [periodDeals, showArchived])

  // Busca textual client-side: filtra SO as linhas exibidas, sobre o conjunto
  // ja filtrado por pipeline + periodo. Nao afeta os cards de topo (KPIs).
  // Varre nome do negocio, contato (leadDisplayName), empresa e telefone (digitos).
  const visibleDeals = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return deals
    const qDigits = q.replace(/\D/g, '')
    return deals.filter((d) => {
      const lead = d.leads
      const name = (d.name ?? '').toLowerCase()
      const contact = leadDisplayName(lead?.name, lead?.phone ?? '').toLowerCase()
      const company = (lead?.company_name ?? '').toLowerCase()
      if (name.includes(q) || contact.includes(q) || company.includes(q)) return true
      if (qDigits) {
        const phoneDigits = (lead?.phone ?? '').replace(/\D/g, '')
        if (phoneDigits.includes(qDigits)) return true
      }
      return false
    })
  }, [deals, debouncedSearch])

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

  // Selecao "todos" opera sobre as linhas visiveis (respeita a busca ativa).
  const toggleSelectAll = () => {
    const allVisibleSelected = visibleDeals.length > 0 && visibleDeals.every((d) => selectedIds.has(d.id))
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleDeals.map((d) => d.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const allSelected = visibleDeals.length > 0 && visibleDeals.every((d) => selectedIds.has(d.id))
  const someSelected = !allSelected && visibleDeals.some((d) => selectedIds.has(d.id))

  // Convert deals to lead-like objects for BulkActionBar + export compatibility.
  // O export (export-leads.ts) le valor/status via `deal` e os nomes via
  // `pipelines`/`pipeline_stages`, entao resolvemos esses objetos aqui a partir
  // dos maps ja montados na tela. Sem isso, as colunas Valor, Pipeline, Etapa e
  // Status saem vazias no CSV/XLSX/PDF.
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
      status: d.status,
      deal: { value: d.value, status: d.status, stage_name: stageMap.get(d.stage_id ?? '')?.name ?? null },
      pipelines: d.pipeline_id ? pipelineMap.get(d.pipeline_id) ?? null : null,
      pipeline_stages: d.stage_id ? stageMap.get(d.stage_id) ?? null : null,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }))
  }, [deals, pipelineMap, stageMap])

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="space-y-6 animate-fade-in">

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Negocios</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gestao completa de negocios e oportunidades
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar negocio..."
                className="h-9 w-56 pl-9"
              />
            </div>
            <PipelineFilter
              value={selectedPipelineId}
              onChange={setSelectedPipelineId}
              pipelines={pipelines ?? []}
            />
            <div className="flex flex-wrap gap-1.5">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className={cardBase}>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total de Negocios</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground mt-2">{deals.length}</p>
            <Breakdown items={[
              { value: String(openDeals.length), color: 'text-yellow-500', dotColor: 'bg-yellow-500', label: 'Aberto' },
              { value: String(closedDeals.length), color: 'text-emerald-500', dotColor: 'bg-emerald-500', label: 'Fechado' },
              { value: String(lostDeals.length), color: 'text-red-500', dotColor: 'bg-red-500', label: 'Perdido' },
            ]} />
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
            <Breakdown items={[
              { value: fmt(openValue), color: 'text-yellow-500', dotColor: 'bg-yellow-500', label: 'Aberto' },
              { value: fmt(closedValue), color: 'text-emerald-500', dotColor: 'bg-emerald-500', label: 'Fechado' },
              { value: fmt(lostValue), color: 'text-red-500', dotColor: 'bg-red-500', label: 'Perdido' },
            ]} />
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
                  <th className={cn(thClass, 'text-left w-[26%]')}>Negocio</th>
                  <th className={cn(thClass, 'text-left w-[10%]')}>Valor</th>
                  <th className={cn(thClass, 'text-left w-[15%]')}>Pipeline · etapa</th>
                  <th className={cn(thClass, 'text-left w-[9%]')}>Status</th>
                  <th className={cn(thClass, 'text-left w-[11%]')}>Temperatura</th>
                  <th className={cn(thClass, 'text-left w-[12%]')}>Responsavel</th>
                  <th className={cn(thClass, 'text-left w-[10%]')}>Data</th>
                  <th className={cn(thClass, 'text-left w-[4%]')}>Chat</th>
                </tr>
              </thead>
              <tbody>
                {visibleDeals.map((deal) => {
                  const lead = deal.leads
                  const stage = deal.stage_id ? stageMap.get(deal.stage_id) : null
                  const pipeline = deal.pipeline_id ? pipelineMap.get(deal.pipeline_id) : null
                  const temp = lead ? leadTemperatureConfig[lead.temperature] : null
                  const assignedName = (deal.profiles as { name?: string } | null)?.name
                  const isSelected = selectedIds.has(deal.id)
                  const status = dealStatusConfig[deal.status]

                  // Coluna de identidade: nome do negocio no titulo; contato (+ empresa)
                  // no subtitulo. Sem nome de negocio, o contato vira titulo.
                  const contactName = leadDisplayName(lead?.name, lead?.phone ?? '')
                  const company = lead?.company_name?.trim()
                  const dealName = deal.name?.trim()
                  const identityTitle = dealName || contactName
                  const identitySubtitle = dealName
                    ? (company ? `${contactName} · ${company}` : contactName)
                    : (company || null)

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
                      <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(deal.id)}
                        />
                      </td>

                      {/* Negocio (identidade rica) */}
                      <td className={tdClass}>
                        <IdentityCell
                          title={identityTitle}
                          subtitle={identitySubtitle}
                          avatarUrl={lead?.avatar_url}
                        />
                      </td>

                      {/* Valor */}
                      <td className={cn(tdClass, 'font-semibold', dealValueColor[deal.status])}>
                        {deal.value ? fmt(deal.value) : '-'}
                      </td>

                      {/* Pipeline · etapa */}
                      <td className={tdClass}>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {pipeline ? (
                            <span className="inline-flex items-center gap-1.5 text-xs min-w-0">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: pipeline.color }} />
                              <span className="truncate">{pipeline.name}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {stage && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                              <span className="truncate">{stage.name}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className={tdClass}>
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', status.className)}>
                          {status.label}
                        </span>
                      </td>

                      {/* Temperatura (compacta) */}
                      <td className={tdClass}>
                        {temp && (
                          <span className="inline-flex items-center gap-1 text-[10px]" title={temp.label}>
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', temp.dotColor)} />
                            {temp.label}
                          </span>
                        )}
                      </td>

                      {/* Responsavel */}
                      <td className={cn(tdClass, 'text-xs')}>
                        {assignedName ?? <span className="text-muted-foreground/40">Sem responsavel</span>}
                      </td>

                      {/* Data (criado, ou fechado quando aplicavel) */}
                      <td className={cn(tdClass, 'text-xs text-muted-foreground whitespace-nowrap')}>
                        {(deal.status === 'won' || deal.status === 'lost') && deal.closed_at
                          ? `fech. ${new Date(deal.closed_at).toLocaleDateString('pt-BR')}`
                          : new Date(deal.created_at).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Chat */}
                      <td className={tdClass}>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/inbox/${deal.lead_id}`) }}
                          className="inline-flex items-center text-muted-foreground hover:text-primary transition-smooth cursor-pointer"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {visibleDeals.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
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
