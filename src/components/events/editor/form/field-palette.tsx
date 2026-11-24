import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CUSTOM_FIELDS, MAX_FIELDS, PREDEFINED_FIELDS, usedKeys, type CatalogEntry, type FieldDraft,
} from '@/lib/events/field-catalog'

interface FieldPaletteProps {
  fields: FieldDraft[]
  onAdd: (entry: CatalogEntry) => void
}

const Chip = ({ entry, disabled, onAdd }: { entry: CatalogEntry; disabled: boolean; onAdd: () => void }) => (
  <button type="button" disabled={disabled} onClick={onAdd}
    className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-smooth',
      disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-primary hover:text-primary')}>
    <Plus className="h-3 w-3" /> {entry.label}
  </button>
)

/** Chips para adicionar campos. Pre-definido entra uma vez; personalizavel, varias. */
export const FieldPalette = ({ fields, onAdd }: FieldPaletteProps) => {
  const used = usedKeys(fields)
  const full = fields.length >= MAX_FIELDS

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-0.5">
        <h2 className="font-medium">Adicionar ao formulário</h2>
        <span className={cn('block text-xs', full ? 'text-destructive' : 'text-muted-foreground')}>
          {fields.length} de {MAX_FIELDS} campos
        </span>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Campos pré-definidos</p>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_FIELDS.map((e) => (
            <Chip key={e.label} entry={e} disabled={full || (!!e.key && used.has(e.key))} onAdd={() => onAdd(e)} />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Campos personalizáveis</p>
        <div className="flex flex-wrap gap-2">
          {CUSTOM_FIELDS.map((e) => <Chip key={e.label} entry={e} disabled={full} onAdd={() => onAdd(e)} />)}
        </div>
      </div>
    </div>
  )
}
