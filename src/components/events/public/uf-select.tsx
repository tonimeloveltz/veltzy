import { cn } from '@/lib/utils'
import { UFS } from '@/lib/events/uf'

interface UfSelectProps {
  value: string
  invalid?: boolean
  className?: string
  onChange: (uf: string) => void
}

export const UfSelect = ({ value, invalid, className, onChange }: UfSelectProps) => (
  <select aria-label="UF" value={value} onChange={(e) => onChange(e.target.value)}
    className={cn('flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm', invalid && 'border-destructive', className)}>
    <option value="">UF</option>
    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
  </select>
)
