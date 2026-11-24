import { cn } from '@/lib/utils'
import type { DealPriority } from '@/types/database'

const LABEL: Record<DealPriority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' }
const TONE: Record<DealPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-secondary text-secondary-foreground',
  high: 'bg-primary/15 text-primary',
}

/** Prioridade do negocio (D5), gravada pela inscricao em evento. */
export const DealPriorityBadge = ({ priority, className }: { priority: DealPriority | null | undefined; className?: string }) =>
  priority ? (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE[priority], className)} title="Prioridade do negócio">
      {LABEL[priority]}
    </span>
  ) : null
