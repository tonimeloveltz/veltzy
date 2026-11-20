import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBulkDeleteLeadMessages } from '@/hooks/use-bulk-delete-lead-messages'
import { InvalidPasswordError } from '@/services/messages.service'

interface ConversationsBulkActionBarProps {
  leadIds: string[]
  onClear: () => void
}

/**
 * Barra flutuante de selecao da inbox, no mesmo formato da de Contatos.
 * Unica acao: apagar as mensagens das conversas selecionadas, confirmada com a
 * senha do admin (validada na edge inbox-delete-messages). Quem decide se a barra
 * aparece (so admin) e a ConversationList.
 */
export const ConversationsBulkActionBar = ({ leadIds, onClear }: ConversationsBulkActionBarProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)
  const navigate = useNavigate()
  const { leadId: openLeadId } = useParams<{ leadId: string }>()
  const bulkDelete = useBulkDeleteLeadMessages()
  const count = leadIds.length

  const setDialogOpen = (open: boolean) => {
    setConfirmOpen(open)
    // Fechar (ou abrir) o dialogo sempre limpa a senha.
    setPassword('')
    setWrongPassword(false)
  }

  const handleConfirm = async () => {
    if (!password) return
    try {
      const deleted = await bulkDelete.mutateAsync({ leadIds, password })
      // A conversa aberta sai da lista: nao deixa o chat vazio de um lead que
      // nao esta mais na inbox.
      if (deleted > 0 && openLeadId && leadIds.includes(openLeadId)) navigate('/inbox')
      onClear()
      setDialogOpen(false)
    } catch (err) {
      // Senha errada: mensagem inline, campo limpo, dialogo aberto.
      if (err instanceof InvalidPasswordError) {
        setPassword('')
        setWrongPassword(true)
        return
      }
      // Outros erros: toast no onError do hook; a selecao fica para tentar de novo.
      setDialogOpen(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/95 backdrop-blur-sm border border-primary/20 rounded-xl p-3 shadow-2xl shadow-primary/10">
        <span className="text-sm font-medium text-foreground ml-1">
          {count} conversa{count > 1 ? 's' : ''} selecionada{count > 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Apagar mensagens
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear} title="Limpar seleção">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => !bulkDelete.isPending && setDialogOpen(v)}>
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
          <form
            id="bulk-delete-confirm"
            className="space-y-2"
            onSubmit={(e) => { e.preventDefault(); handleConfirm() }}
          >
            <Label htmlFor="bulk-delete-password">Sua senha</Label>
            <Input
              id="bulk-delete-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setWrongPassword(false) }}
              disabled={bulkDelete.isPending}
              aria-invalid={wrongPassword}
              aria-describedby="bulk-delete-password-hint"
            />
            <p
              id="bulk-delete-password-hint"
              className={wrongPassword ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
            >
              {wrongPassword ? 'Senha incorreta' : 'Para confirmar, digite a sua senha de acesso.'}
            </p>
          </form>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={bulkDelete.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="bulk-delete-confirm"
              variant="destructive"
              disabled={bulkDelete.isPending || !password}
            >
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
