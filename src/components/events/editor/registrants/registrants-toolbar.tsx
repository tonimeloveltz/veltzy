import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { StatusFilter } from '@/services/event-registrations.service'

const STATUSES: Array<{ value: StatusFilter; label: string }> = [
  { value: 'active', label: 'Ativos' }, { value: 'registered', label: 'Inscritos' }, { value: 'confirmed', label: 'Confirmados' },
  { value: 'attended', label: 'Presentes' }, { value: 'absent', label: 'Ausentes' }, { value: 'canceled', label: 'Cancelados' },
  { value: 'all', label: 'Todos' },
]

interface RegistrantsToolbarProps {
  search: string
  status: StatusFilter
  origin: string
  origins: Array<{ value: string; label: string }>
  onSearch: (v: string) => void
  onStatus: (v: StatusFilter) => void
  onOrigin: (v: string) => void
}

export const RegistrantsToolbar = (p: RegistrantsToolbarProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="relative min-w-[220px] flex-1">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Buscar por nome, WhatsApp ou e-mail" value={p.search} onChange={(e) => p.onSearch(e.target.value)} />
    </div>
    <Select value={p.status} onValueChange={(v) => p.onStatus(v as StatusFilter)}>
      <SelectTrigger className="w-40" aria-label="Status"><SelectValue /></SelectTrigger>
      <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
    </Select>
    <Select value={p.origin} onValueChange={p.onOrigin}>
      <SelectTrigger className="w-44" aria-label="Origem"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas as origens</SelectItem>
        <SelectItem value="direct">Direto</SelectItem>
        {p.origins.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
)
