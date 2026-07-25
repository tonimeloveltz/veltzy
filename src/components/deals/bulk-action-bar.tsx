import { useState } from 'react'
import { ArrowRightLeft, Archive, Trash2, Download, X, FolderInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BulkTransferModal } from './bulk-transfer-modal'
import { BulkMovePipelineModal } from './bulk-move-pipeline-modal'
import { BulkArchiveDialog } from './bulk-archive-dialog'
import { BulkDeleteDialog } from './bulk-delete-dialog'
import { useBulkExport } from '@/hooks/use-bulk-leads'
import type { AppRole, LeadWithDetails } from '@/types/database'

interface BulkActionBarProps {
  selectedIds: Set<string>
  leads: LeadWithDetails[]
  onClear: () => void
  userRole: AppRole
  mode?: 'leads' | 'deals'
}

export const BulkActionBar = ({ selectedIds, leads, onClear, userRole, mode = 'leads' }: BulkActionBarProps) => {
  const [transferOpen, setTransferOpen] = useState(false)
  const [movePipelineOpen, setMovePipelineOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { exportCsv, exportPdf, exportXlsx } = useBulkExport()

  const selectedLeads = leads.filter((l) => selectedIds.has(l.id))
  const selectedArray = Array.from(selectedIds)
  const count = selectedIds.size

  const canTransfer = userRole === 'admin' || userRole === 'manager' || userRole === 'super_admin'
  const canDelete = userRole === 'admin' || userRole === 'super_admin'

  // Nao faz sentido arquivar itens ja arquivados: esconde o botao quando toda a
  // selecao ja esta arquivada (ex.: filtro "Mostrar arquivados" ativo).
  const allArchived = selectedLeads.length > 0 && selectedLeads.every((l) => l.status === 'archived')

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/95 backdrop-blur-sm border border-primary/20 rounded-xl p-3 shadow-2xl shadow-primary/10">
        <span className="text-sm font-medium text-foreground ml-1">
          {count} selecionado{count > 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {canTransfer && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="h-4 w-4" />
                Transferir
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMovePipelineOpen(true)}>
                <FolderInput className="h-4 w-4" />
                Mover Pipeline
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCsv(selectedLeads)}>
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportXlsx(selectedLeads)}>
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPdf(selectedLeads)}>
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!allArchived && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-4 w-4" />
              Arquivar
            </Button>
          )}

          {canDelete && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <BulkTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        leadIds={selectedArray}
        onSuccess={onClear}
        mode={mode}
      />

      <BulkMovePipelineModal
        open={movePipelineOpen}
        onClose={() => setMovePipelineOpen(false)}
        leadIds={selectedArray}
        onSuccess={onClear}
      />

      <BulkArchiveDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        leadIds={selectedArray}
        onSuccess={onClear}
        mode={mode}
      />

      <BulkDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        leadIds={selectedArray}
        onSuccess={onClear}
        mode={mode}
      />
    </>
  )
}
