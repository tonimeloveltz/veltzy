import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBulkDeleteLeadMessages } from '@/hooks/use-bulk-delete-lead-messages'

interface ConversationsBulkActionBarProps {
  leadIds: string[]
  onClear: () => void
}

/**
 * Barra flutuante de selecao da inbox, no mesmo formato da de Contatos.
 * Unica acao: apagar as mensagens das conversas selecionadas (o "x" da linha,
 * em lote). Quem decide se a barra aparece (admin/manager) e a ConversationList.
 */
export const ConversationsBulkActionBar = ({ leadIds, onClear }: ConversationsBulkActionBarProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const navigate = useNavigate()
  const { leadId: openLeadId } = useParams<{ leadId: string }>()
  const bulkDelete = useBulkDeleteLeadMessages()
  const count = leadIds.length

  const handleConfirm = async () => {
    try {
      const deleted = await bulkDelete.mutateAsync({ leadIds })
      // A conversa aberta sai da lista: nao deixa o chat vazio de um lead que
      // nao esta mais na inbox.
      if (deleted > 0 && openLeadId && leadIds.includes(openLeadId)) navigate('/inbox')
      onClear()
    } catch {
      // O toast de erro sai do onError do hook; a selecao fica para tentar de novo.
    } finally {
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/95 backdrop-blur-sm border border-primary/20 rounded-xl p-3 shadow-2xl shadow-primary/10">
        <span className="text-sm font-medium text-foreground ml-1">
          {count} conversa{count > 1 ? 's' : ''} selecionada{count > 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Apagar mensagens
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear} title="Limpar seleção">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => !bulkDelete.isPending && setConfirmOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Apagar as mensagens de {count} conversa{count > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens das conversas selecionadas serão apagadas e elas saem da inbox.
              Os contatos continuam no pipeline e em Contatos. Não apaga nada no WhatsApp,
              e não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={bulkDelete.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={bulkDelete.isPending}>
              {bulkDelete.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Apagando...
                </>
              ) : (
                'Apagar mensagens'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
