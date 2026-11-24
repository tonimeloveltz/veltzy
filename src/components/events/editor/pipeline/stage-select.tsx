import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PipelineStage } from '@/types/database'

const NONE = '__none__'

interface StageSelectProps {
  label: string
  value: string
  stages: PipelineStage[]
  count?: number
  allowNone?: boolean
  onChange: (id: string) => void
}

export const StageSelect = ({ label, value, stages, count, allowNone, onChange }: StageSelectProps) => (
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3rem] items-center gap-2 text-sm">
    <span>{label}</span>
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger aria-label={label} className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>Não mover</SelectItem>}
        {!allowNone && !value && <SelectItem value={NONE} disabled>Escolha a etapa</SelectItem>}
        {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
    <span className="text-right text-xs text-muted-foreground" title="Negócios do evento nesta etapa">
      {value && count !== undefined ? count : ''}
    </span>
  </div>
)
