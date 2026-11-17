import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, ExternalLink, MoreHorizontal, Pencil, CopyPlus, ScanLine, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRoles } from '@/hooks/use-roles'
import { useDuplicateEvent } from '@/hooks/events/use-duplicate-event'
import { useCancelEvent } from '@/hooks/events/use-cancel-event'
import { eventPublicUrl, type EventListItem } from '@/lib/events/event-list'
import { copyEventLink } from '@/lib/events/copy-event-link'

interface EventRowActionsProps {
  event: EventListItem
}

export const EventRowActions = ({ event }: EventRowActionsProps) => {
  const navigate = useNavigate()
  const { isManager } = useRoles()
  const duplicate = useDuplicateEvent()
  const cancel = useCancelEvent()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const isDraft = event.status === 'draft'
  const canCancel = isManager && event.status !== 'finished' && event.status !== 'canceled'

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild={!isDraft} disabled={isDraft}>
            {isDraft ? (
              <span><ExternalLink className="h-4 w-4" /></span>
            ) : (
              <a href={eventPublicUrl(event.slug)} target="_blank" rel="noreferrer" aria-label="Ver página">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDraft ? 'Publique para ver a página' : 'Ver página'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Copiar link"
            onClick={() => copyEventLink(event.slug)}>
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copiar link</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => navigate(`/eventos/${event.id}`)}>
            <Pencil className="h-4 w-4" /> {isManager ? 'Editar' : 'Abrir'}
          </DropdownMenuItem>
          {isManager && (
            <DropdownMenuItem
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate(event.id, { onSuccess: (newId) => navigate(`/eventos/${newId}`) })}
            >
              <CopyPlus className="h-4 w-4" /> Duplicar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => navigate(`/eventos/${event.id}/check-in`)}>
            <ScanLine className="h-4 w-4" /> Modo check-in
          </DropdownMenuItem>
          {canCancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmCancel(true)}>
                <Ban className="h-4 w-4" /> Cancelar evento
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar "{event.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A página deixa de aceitar inscrições e as mensagens agendadas não saem mais.
              Se o aviso de cancelamento estiver ligado, os inscritos recebem a mensagem no WhatsApp.
              Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancel.mutate(event.id)}
            >
              Cancelar evento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
