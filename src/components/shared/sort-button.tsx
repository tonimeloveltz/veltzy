import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SortState } from '@/lib/table-sort'

interface SortButtonProps<K extends string> {
  columnKey: K
  /** Rotulo da coluna, usado no title e no aria-label. */
  label: string
  sort: SortState<K> | null
  onToggle: (key: K) => void
}

/**
 * Botao de ordenar ao lado do rotulo da coluna. Mora no `<thead>`, fora das
 * `<tr>` clicaveis, entao nao precisa de `stopPropagation`.
 */
export const SortButton = <K extends string>({ columnKey, label, sort, onToggle }: SortButtonProps<K>) => {
  const direction = sort?.key === columnKey ? sort.direction : null
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
  const description =
    direction === 'asc' ? `${label}: crescente`
    : direction === 'desc' ? `${label}: decrescente`
    : `Ordenar por ${label}`

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-5 w-5 p-0 shrink-0"
      title={description}
      aria-label={description}
      onClick={() => onToggle(columnKey)}
    >
      {/* So a coluna ativa fica colorida. */}
      <Icon className={cn('h-3.5 w-3.5', direction ? 'text-primary' : 'text-muted-foreground/40')} />
    </Button>
  )
}
