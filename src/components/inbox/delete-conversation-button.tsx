import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteLeadMessages } from '@/hooks/use-delete-lead-messages'
import { useRoles } from '@/hooks/use-roles'

interface DeleteConversationButtonProps {
  leadId: string
  leadName: string
  /**
   * So para a largura: o "x" centraliza numa caixa do tamanho da bolinha, entao
   * fica centrado sobre ela com 1, 2 ou 3 digitos.
   */
  unreadCount: number
}

/**
 * "x" vermelho ACIMA da bolinha de nao lidas. Posicionado pelo ConversationItem,
 * como IRMAO do botao da linha e nao dentro dele: botao dentro de botao e HTML
 * invalido, e o clique no "x" tambem abriria a conversa.
 *
 * Aparece ao passar o mouse na LINHA (o ConversationItem e o `group`):
 * - com bolinha: no vao entre o topo da linha e ela, centralizado. A bolinha NAO
 *   some, o "x" fica em cima sem cobri-la;
 * - sem bolinha: no lugar onde ela estaria, mesma altura e mesmo centro.
 *
 * So admin ou manager (isManager ja inclui admin e super_admin). Vendedor nao
 * ve o "x". A regra e SO de interface: a RLS de veltzy.messages ainda aceita o
 * DELETE de qualquer membro da empresa.
 */
const DeleteConversationButton = ({ leadId, leadName, unreadCount }: DeleteConversationButtonProps) => {
  const navigate = useNavigate()
  const { leadId: selectedLeadId } = useParams<{ leadId: string }>()
  const deleteLeadMessages = useDeleteLeadMessages()
  const { isManager } = useRoles()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleConfirm = () => {
    deleteLeadMessages.mutate(
      { leadId },
      {
        onSuccess: (deleted) => {
          // A conversa sai da lista. Se era a aberta, nao deixa o chat vazio
          // de um lead que nao esta mais na inbox.
          if (deleted > 0 && selectedLeadId === leadId) navigate('/inbox')
        },
      },
    )
    setConfirmOpen(false)
  }

  if (!isManager) return null

  return (
    <>
      {/* Caixa com a mesma largura da bolinha (mesmo min-w, padding e fonte,
          com o numero invisivel), alinhada a ela pela direita; o "x" centraliza
          nessa caixa. Posicao FIXA, com ou sem bolinha: na faixa da linha do
          horario (top-[11px], h-3.5), que deixa 5px ate a bolinha quando ela
          existe (comeca em 30px). Sem bolinha, o ConversationItem reserva a
          mesma coluna, entao o "x" cai no mesmo canto e nao em cima do texto. Sem bolinha, vai para
          o lugar da bolinha, que centra na linha do preview (top-[30px], h-5,
          casando com o mt-[18px] dela no ConversationItem).
          pointer-events-none para a caixa nao roubar o clique da linha; so o
          "x" e clicavel. */}
      <div className="pointer-events-none absolute right-3 top-[11px] z-10 flex h-3.5 min-w-5 items-center justify-center px-1.5 text-[10px] font-bold leading-none">
        <span className="invisible">{unreadCount}</span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={deleteLeadMessages.isPending}
          title="Apagar mensagens"
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar as mensagens desta conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens com {leadName} serão apagadas e a conversa sai da inbox.
              O contato continua no pipeline e em Contatos. Não apaga nada no WhatsApp,
              e não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirm}
            >
              Apagar mensagens
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export { DeleteConversationButton }
