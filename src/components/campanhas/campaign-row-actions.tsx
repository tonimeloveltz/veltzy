import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useDeleteCampaign } from '@/hooks/use-campaigns'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { BlastCampaign } from '@/types/database'

interface CampaignRowActionsProps {
  campaign: Pick<BlastCampaign, 'id' | 'name' | 'status'>
}

const EDITABLE = ['draft', 'scheduled']

export function CampaignRowActions({ campaign }: CampaignRowActionsProps) {
  const navigate = useNavigate()
  const deleteCampaign = useDeleteCampaign()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const canEdit = EDITABLE.includes(campaign.status)

  // Eventos de portal sobem pela árvore React: o wrapper impede o clique de abrir a linha.
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações da campanha ${campaign.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onSelect={() => navigate(`/campanhas/${campaign.id}/editar`)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a campanha {campaign.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Envios que ainda não saíram serão cancelados. Mensagens já enviadas continuam nas conversas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCampaign.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCampaign.isPending}
              onClick={(e) => {
                e.preventDefault()
                deleteCampaign.mutate(campaign.id, { onSuccess: () => setConfirmOpen(false) })
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
