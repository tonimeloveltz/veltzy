import { useState } from 'react'
import { Search, Plus, Settings2, Flame, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePipelineStore } from '@/stores/pipeline.store'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useRoles } from '@/hooks/use-roles'
import { useExportLeads } from '@/hooks/use-export-leads'
import type { LeadTemperature, LeadWithDetails } from '@/types/database'
import { leadTemperatureConfig } from '@/lib/lead-config'
import { ImportLeadsModal } from '@/components/pipeline/import-leads-modal'
import { cn } from '@/lib/utils'

const TemperatureIcon = ({ temperature }: { temperature: LeadTemperature }) => {
  switch (temperature) {
    case 'cold':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0">
          <line x1="8" y1="1" x2="8" y2="15" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="8" x2="15" y2="8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="3" x2="13" y2="13" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="13" y1="3" x2="3" y2="13" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="8" r="1.5" fill="#3b82f6"/>
        </svg>
      )
    case 'warm':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0">
          <circle cx="8" cy="8" r="3" fill="#f59e0b"/>
          <line x1="8" y1="1" x2="8" y2="3.5" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="8" y1="12.5" x2="8" y2="15" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="8" x2="3.5" y2="8" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="12.5" y1="8" x2="15" y2="8" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="3" y1="3" x2="4.8" y2="4.8" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="11.2" y1="11.2" x2="13" y2="13" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="13" y1="3" x2="11.2" y2="4.8" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="4.8" y1="11.2" x2="3" y2="13" stroke="#fde68a" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    case 'hot':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" className="shrink-0">
          <path d="M8 14c-3 0-5-2-5-4.5C3 7 4 5.5 5 4c0 1.5 1 2.5 2 3C7 5 8 3 7.5 1 9.5 2.5 11 5 11 7c.5-1 .5-2 0-3 1.5 1.5 2 3.5 2 5.5C13 12 11 14 8 14z" fill="#f97316"/>
          <path d="M8 12c-1.5 0-2.5-1-2.5-2.5C5.5 8.5 6 7.5 7 7c0 .8.5 1.5 1 1.8C8 8 8.5 7 8.2 6c1 .8 1.5 2 1.5 3C9.7 10.5 9 12 8 12z" fill="#fed7aa"/>
        </svg>
      )
    case 'fire':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" className="shrink-0">
          <path d="M8 15c-3.5 0-6-2.5-6-5.5C2 7 3.5 5 5 3.5c0 2 1 3 2 3.5C7 5.5 8 3.5 7.5 1c2.5 1.5 4 4.5 4 7 .5-1 .5-2.5 0-3.5C13 6 14 8.5 14 10c0 3-2.5 5-6 5z" fill="#ef4444"/>
          <path d="M8 13c-2 0-3.5-1.5-3.5-3.5C4.5 8 5.5 7 6.5 6.5c0 1 .5 2 1.5 2.5C8 7.5 8.5 6 8 4.5c1.5 1 2.5 2.5 2.5 4 .5-.5.5-1.5 0-2C12 8 12.5 9 12.5 10c0 1.5-2 3-4.5 3z" fill="#fca5a5"/>
          <path d="M8 11.5c-1 0-2-.8-2-2 0-1 .5-1.8 1.2-2 0 .8.5 1.2 1 1.5.2-1 .5-1.8.3-2.5.8.5 1.2 1.5 1.2 2.2 0 1.5-.8 2.8-1.7 2.8z" fill="#b91c1c"/>
        </svg>
      )
  }
}

interface PipelineHeaderProps {
  onAddLead: () => void
  onManageStages: () => void
  fireOnly: boolean
  onToggleFireOnly: () => void
  leads?: LeadWithDetails[]
  pipelineName?: string
}

const PipelineHeader = ({ onAddLead, onManageStages, fireOnly, onToggleFireOnly, leads, pipelineName }: PipelineHeaderProps) => {
  const { filters, setFilters } = usePipelineStore()
  const activePipelineId = usePipelineStore((s) => s.activePipelineId)
  const { data: sources } = useLeadSources()
  const { isAdmin, isManager } = useRoles()
  const { doExport, isExporting } = useExportLeads()
  const [importModalOpen, setImportModalOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-bold">{pipelineName || 'Pipeline'}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 transition-smooth',
            fireOnly
              ? 'bg-red-500/10 drop-shadow-sm'
              : 'text-muted-foreground'
          )}
          onClick={onToggleFireOnly}
          title="Filtrar leads pegando fogo"
        >
          <Flame className={cn('h-4 w-4', fireOnly ? 'text-[#ef4444]' : '')} />
        </Button>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar leads..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="h-9 w-48 pl-8"
          />
        </div>

        <Select
          value={filters.sourceId ?? 'all'}
          onValueChange={(v) => setFilters({ sourceId: v === 'all' ? null : v })}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {sources?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.temperature ?? 'all'}
          onValueChange={(v) => setFilters({ temperature: v === 'all' ? null : v as LeadTemperature })}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas temps.</SelectItem>
            {(Object.keys(leadTemperatureConfig) as LeadTemperature[]).map((t) => (
              <SelectItem key={t} value={t}>
                <span className="flex items-center gap-2">
                  <TemperatureIcon temperature={t} />
                  {leadTemperatureConfig[t].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(isAdmin || isManager) && (
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={onManageStages} title="Gerenciar fases">
            <Settings2 className="h-4 w-4" />
          </Button>
        )}

        {(isAdmin || isManager) && (
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setImportModalOpen(true)} title="Importar leads">
            <Download className="h-4 w-4" />
          </Button>
        )}

        {leads && leads.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" title="Exportar leads" disabled={isExporting}>
                <Upload className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport('csv', activePipelineId)}>
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport('xlsx', activePipelineId)}>
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button size="sm" className="h-9" onClick={onAddLead}>
          <Plus className="mr-1 h-4 w-4" />
          Novo Lead
        </Button>
      </div>

      <ImportLeadsModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </div>
  )
}

export { PipelineHeader }
