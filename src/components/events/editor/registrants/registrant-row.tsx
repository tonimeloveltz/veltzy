import { Link } from 'react-router-dom'
import { Briefcase, Check, MessageSquare, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatPhoneBR } from '@/lib/phone'
import {
  answerDisplay, fullName, registrationOrigin, STATUS_LABEL, timeInZone, type RegistrationRow,
} from '@/lib/events/registration-view'
import type { RegistrationAction } from '@/hooks/events/use-registration-action'
import { DealPriorityBadge } from '@/components/shared/deal-priority-badge'

interface RegistrantRowProps {
  row: RegistrationRow
  timeZone: string
  companyFieldId: string | null
  isManager: boolean
  canCheckIn: boolean
  onCheckIn: (undo: boolean) => void
  onAction: (action: RegistrationAction) => void
  onOpenDeal: () => void
}

export const RegistrantRow = ({ row, timeZone, companyFieldId, isManager, canCheckIn, onCheckIn, onAction, onOpenDeal }: RegistrantRowProps) => {
  const canceled = row.status === 'canceled'
  const priority = row.deal?.priority
  return (
    <tr className={cn('border-b align-middle', canceled && 'text-muted-foreground')}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{fullName(row)}</span>
          <DealPriorityBadge priority={priority} />
        </div>
        {row.email && <div className="text-xs text-muted-foreground">{row.email}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2">{formatPhoneBR(row.whatsapp)}</td>
      <td className="px-3 py-2">{answerDisplay(row, companyFieldId)}</td>
      <td className="px-3 py-2 text-xs">{registrationOrigin(row)}</td>
      <td className="px-3 py-2">{STATUS_LABEL[row.status]}</td>
      <td className="whitespace-nowrap px-3 py-2">
        {row.status === 'attended' && row.checked_in_at ? (
          <span className="flex items-center gap-1 text-primary">
            <Check className="h-4 w-4" /> Presente · {timeInZone(row.checked_in_at, timeZone)}
            <Button type="button" variant="link" size="sm" className="h-auto px-1" disabled={!canCheckIn} onClick={() => onCheckIn(true)}>
              Desfazer
            </Button>
          </span>
        ) : !canceled && (
          <Button type="button" variant="outline" size="sm" disabled={!canCheckIn} onClick={() => onCheckIn(false)}>Marcar presente</Button>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Abrir negócio"
            disabled={!row.deal_id || !row.lead_id} onClick={onOpenDeal}>
            <Briefcase className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Abrir conversa" asChild disabled={!row.lead_id}>
            <Link to={`/inbox/${row.lead_id ?? ''}`}><MessageSquare className="h-4 w-4" /></Link>
          </Button>
          {isManager && !canceled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {row.status === 'registered' && <DropdownMenuItem onClick={() => onAction('confirm')}>Confirmar manualmente</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => onAction('resend')}>Reenviar confirmação</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction('cancel')}>Cancelar inscrição</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </td>
    </tr>
  )
}
