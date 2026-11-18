import { useState } from 'react'
import { ChevronRight, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EventStatusBadge } from '@/components/events/event-status-badge'
import { copyEventLink } from '@/lib/events/copy-event-link'
import { eventPublicUrl } from '@/lib/events/event-list'
import type { Event } from '@/types/events'

interface EditorHeaderProps {
  event: Event
  title: string
  isDirty: boolean
  readOnly: boolean
  saving: boolean
  publishing: boolean
  onSave: () => void
  onPublish: () => void
  onUnpublish: () => void
  onNavigate: (to: string) => void
}

export const EditorHeader = (p: EditorHeaderProps) => {
  const { event } = p
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const isDraft = event.status === 'draft'
  const isLive = event.status === 'published' || event.status === 'closed'
  const busy = p.saving || p.publishing

  return (
    <header className="space-y-3">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <button type="button" onClick={() => p.onNavigate('/eventos')} className="hover:text-foreground">Eventos</button>
        <ChevronRight className="h-4 w-4" />
        <span className="truncate text-foreground">{event.title}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 truncate text-xl font-semibold">{p.title.trim() || event.title}</h1>
        <EventStatusBadge status={event.status} closedReason={event.closed_reason} />
        {p.isDirty && <span className="text-xs text-muted-foreground">Alterações não salvas</span>}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="icon" className="h-9 w-9" asChild={!isDraft} disabled={isDraft} aria-label="Ver página">
                  {isDraft ? <ExternalLink className="h-4 w-4" /> : (
                    <a href={eventPublicUrl(event.slug)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{isDraft ? 'Publique para ver a página' : 'Ver página'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="icon" className="h-9 w-9" disabled={isDraft} aria-label="Copiar link"
                  onClick={() => copyEventLink(event.slug)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{isDraft ? 'O link funciona depois de publicar' : 'Copiar link'}</TooltipContent>
          </Tooltip>
          {!p.readOnly && (
            <>
              <Button variant="outline" onClick={p.onSave} disabled={!p.isDirty || busy}>
                {p.saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </Button>
              {isDraft && (
                <Button onClick={p.onPublish} disabled={busy}>
                  {p.publishing && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
                </Button>
              )}
              {isLive && (
                <Button variant="outline" onClick={() => setConfirmUnpublish(true)} disabled={busy}>Despublicar</Button>
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Despublicar o evento?</AlertDialogTitle>
            <AlertDialogDescription>
              A página sai do ar e para de aceitar inscrições. Quem já se inscreveu continua inscrito.
              Você pode publicar de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={p.onUnpublish}>Despublicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
