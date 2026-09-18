import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BulkDeleteDialog } from '@/components/deals/bulk-delete-dialog'

interface ContactsBulkActionBarProps {
  selectedIds: Set<string>
  onClear: () => void
}

/**
 * Barra flutuante de selecao da tela de Contatos.
 *
 * Espelha a de Negocios (components/deals/bulk-action-bar), mas so com a acao
 * de excluir: transferir/arquivar/mover pipeline sao acoes de NEGOCIO, nao
 * fazem sentido sobre um contato solto. Quem monta a barra ja decide se o
 * usuario pode excluir, entao aqui nao ha checagem de role.
 */
export const ContactsBulkActionBar = ({ selectedIds, onClear }: ContactsBulkActionBarProps) => {
  const [deleteOpen, setDeleteOpen] = useState(false)

  const selectedArray = Array.from(selectedIds)
  const count = selectedIds.size

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/95 backdrop-blur-sm border border-primary/20 rounded-xl p-3 shadow-2xl shadow-primary/10">
        <span className="text-sm font-medium text-foreground ml-1">
          {count} selecionado{count > 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>

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
    </>
  )
}
