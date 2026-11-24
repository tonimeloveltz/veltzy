import { CheckCircle2, ChevronRight, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChecklistItem, PublishMissingKey } from '@/lib/events/publish-checklist'

interface PublishChecklistCardProps {
  items: ChecklistItem[]
  missing: PublishMissingKey[]
  onGo: (item: ChecklistItem) => void
}

/** "Pronto para publicar": espelho do event_publish_missing, recalculado a cada mudanca. */
export const PublishChecklistCard = ({ items, missing, onGo }: PublishChecklistCardProps) => {
  const pending = new Set(missing)
  const done = items.filter((i) => !pending.has(i.key)).length

  return (
    <aside className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Pronto para publicar</h2>
        <span className="text-xs text-muted-foreground">{done} de {items.length}</span>
      </div>
      <ul className="space-y-1">
        {items.map((item) => {
          const ok = !pending.has(item.key)
          return (
            <li key={item.key}>
              <button type="button" disabled={ok} onClick={() => onGo(item)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  ok ? 'text-muted-foreground' : 'hover:bg-muted')}>
                {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0" />}
                <span className="flex-1">{item.label}</span>
                {!ok && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </li>
          )
        })}
      </ul>
      {missing.length === 0 && <p className="text-xs text-primary">Tudo certo para publicar.</p>}
    </aside>
  )
}
