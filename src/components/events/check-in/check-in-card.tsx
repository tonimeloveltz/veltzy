import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPhoneBR } from '@/lib/phone'
import { answerDisplay, fullName, timeInZone, type RegistrationRow } from '@/lib/events/registration-view'

interface CheckInCardProps {
  row: RegistrationRow
  companyFieldId: string | null
  timeZone: string
  disabled: boolean
  onCheckIn: () => void
  onAskUndo: () => void
}

export const CheckInCard = ({ row, companyFieldId, timeZone, disabled, onCheckIn, onAskUndo }: CheckInCardProps) => {
  const present = row.status === 'attended' && row.checked_in_at
  const company = answerDisplay(row, companyFieldId)
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{fullName(row)}</p>
        <p className="truncate text-sm text-muted-foreground">{[company, formatPhoneBR(row.whatsapp)].filter(Boolean).join(' · ')}</p>
      </div>
      {present ? (
        <Button type="button" className="h-12 min-w-[96px] bg-primary/15 text-primary hover:bg-primary/25" disabled={disabled}
          onClick={onAskUndo} aria-label={`${fullName(row)} presente às ${timeInZone(row.checked_in_at!, timeZone)}. Desfazer`}>
          <Check className="h-5 w-5" /> {timeInZone(row.checked_in_at!, timeZone)}
        </Button>
      ) : (
        <Button type="button" className="h-12 min-w-[96px]" disabled={disabled} onClick={onCheckIn}>Presente</Button>
      )}
    </li>
  )
}
