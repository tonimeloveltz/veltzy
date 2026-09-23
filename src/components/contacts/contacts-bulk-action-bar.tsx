import { useState } from 'react'
import { Trash2, X, Workflow, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BulkDeleteDialog } from '@/components/deals/bulk-delete-dialog'
import { useAuthStore } from '@/stores/auth.store'
import { useCadences, useAddLeadsToCadence } from '@/hooks/use-cadences'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface ContactsBulkActionBarProps {
  selectedIds: Set<string>
  onClear: () => void
  canDelete?: boolean
}

/** Dialog do START MANUAL: inscreve os contatos selecionados numa cadência. */
function AddToCadenceDialog({ leadIds, open, onOpenChange, onDone }: {
  leadIds: string[]; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void
}) {
  const [cadenceId, setCadenceId] = useState('')
  const { data: cadences } = useCadences()
  const addLeads = useAddLeadsToCadence()
  const enabled = (cadences ?? []).filter((c) => c.is_enabled)

  const handleAdd = async () => {
    if (!cadenceId) return
    await addLeads.mutateAsync({ cadenceId, leadIds })
    onOpenChange(false); setCadenceId(''); onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adicionar {leadIds.length} contato(s) à cadência</DialogTitle></DialogHeader>
        <Select value={cadenceId} onValueChange={setCadenceId}>
          <SelectTrigger><SelectValue placeholder="Escolha a cadência" /></SelectTrigger>
          <SelectContent>
            {enabled.length === 0
              ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma cadência ativa</div>
              : enabled.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={!cadenceId || addLeads.isPending}>
            {addLeads.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Barra flutuante de selecao da tela de Contatos.
 * Excluir (gated por canDelete) + Adicionar a cadencia (START manual do mkt-ativo,
 * gated por company.features.mkt_ativo_enabled).
 */
export const ContactsBulkActionBar = ({ selectedIds, onClear, canDelete = true }: ContactsBulkActionBarProps) => {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [cadenceOpen, setCadenceOpen] = useState(false)
  const mktAtivo = useAuthStore((s) => s.company?.features?.mkt_ativo_enabled) === true

  const selectedArray = Array.from(selectedIds)
  const count = selectedIds.size

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/95 backdrop-blur-sm border border-primary/20 rounded-xl p-3 shadow-2xl shadow-primary/10">
        <span className="text-sm font-medium text-foreground ml-1">
          {count} selecionado{count > 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {mktAtivo && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCadenceOpen(true)}>
              <Workflow className="h-4 w-4" />
              Adicionar à cadência
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

      <BulkDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        leadIds={selectedArray}
        onSuccess={onClear}
        mode="contacts"
      />
      <AddToCadenceDialog
        leadIds={selectedArray}
        open={cadenceOpen}
        onOpenChange={setCadenceOpen}
        onDone={onClear}
      />
    </>
  )
}
