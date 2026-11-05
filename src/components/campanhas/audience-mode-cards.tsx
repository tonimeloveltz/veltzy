import { Columns3, Globe, ListChecks, Tag, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AudienceMode } from '@/lib/campaign-draft'

const MODES: { value: AudienceMode; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'Todos ativos', hint: 'Todos os contatos ativos com telefone', icon: Users },
  { value: 'stage', label: 'Por etapa', hint: 'Contatos em etapas específicas do funil', icon: Columns3 },
  { value: 'source', label: 'Por origem', hint: 'Contatos que vieram de uma origem', icon: Globe },
  { value: 'tag', label: 'Por tag', hint: 'Contatos com as tags escolhidas', icon: Tag },
  { value: 'manual', label: 'Seleção manual', hint: 'Você escolhe os contatos um a um', icon: ListChecks },
]

interface AudienceModeCardsProps {
  value: AudienceMode
  onChange: (mode: AudienceMode) => void
}

export function AudienceModeCards({ value, onChange }: AudienceModeCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {MODES.map((m) => {
        const on = value === m.value
        const Icon = m.icon
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(m.value)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/50',
              on ? 'border-primary bg-primary/5' : 'border-input',
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
