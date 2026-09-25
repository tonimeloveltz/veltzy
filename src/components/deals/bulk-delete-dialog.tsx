import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBulkDelete, useBulkDeleteDeals } from '@/hooks/use-bulk-leads'

interface BulkDeleteDialogProps {
  open: boolean
  onClose: () => void
  leadIds: string[]
  onSuccess: () => void
  mode?: 'leads' | 'deals' | 'contacts'
}

export const BulkDeleteDialog = ({ open, onClose, leadIds, onSuccess, mode = 'leads' }: BulkDeleteDialogProps) => {
  const [confirmText, setConfirmText] = useState('')
  const done = () => {
    onSuccess()
    handleClose()
  }

  // Em 'deals' os ids sao de deal: o caminho de leads apagaria o contato, nao
  // o negocio, caso algum id viesse a casar. 'contacts' e o MESMO caminho de
  // 'leads' (contato = lead), so muda o nome que o usuario le.
  const bulkDeleteLeads = useBulkDelete(done, mode === 'contacts' ? 'Contatos' : 'Leads')
  const bulkDeleteDeals = useBulkDeleteDeals(done)
  const bulkDelete = mode === 'deals' ? bulkDeleteDeals : bulkDeleteLeads

  const handleClose = () => {
    setConfirmText('')
    onClose()
  }

  const handleDelete = async () => {
    if (!isConfirmed) return
    if (mode === 'deals') {
      await bulkDeleteDeals.mutateAsync({ dealIds: leadIds })
    } else {
      await bulkDeleteLeads.mutateAsync({ leadIds })
    }
  }

  // Contatos confirma so no botao: o aviso do cascade ja e a barreira, e a
  // selecao em lote ali e explicita (checkbox por linha). Negocios e leads
  // seguem exigindo digitar EXCLUIR - comportamento ja em producao.
  const requiresTyping = mode !== 'contacts'
  const isConfirmed = !requiresTyping || confirmText === 'EXCLUIR'
  const label = mode === 'deals' ? 'negócio' : mode === 'contacts' ? 'contato' : 'lead'

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Excluir {leadIds.length} {label}{leadIds.length > 1 ? 's' : ''} permanentemente
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta acao nao pode ser desfeita. Todos os dados dos {label}s selecionados serao removidos permanentemente.
            {/* `deals.lead_id` e ON DELETE CASCADE: apagar o contato apaga os
                negocios dele junto. Quem clica precisa saber disso ANTES. */}
            {mode === 'contacts' && ' Os negócios vinculados a esses contatos também serão excluídos.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requiresTyping && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Digite <span className="font-mono font-bold text-foreground">EXCLUIR</span> para confirmar:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={bulkDelete.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || bulkDelete.isPending}
          >
            {bulkDelete.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Excluindo...
              </>
            ) : (
              'Excluir permanentemente'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
