import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { getLeadsByCompany } from '@/services/leads.service'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface ManualContactPickerProps {
  value: string[]
  onChange: (leadIds: string[]) => void
}

/** Seleção manual de contatos (multi-select com busca). Só lista leads com telefone. */
export function ManualContactPicker({ value, onChange }: ManualContactPickerProps) {
  const companyId = useAuthStore((s) => s.company?.id)
  const [search, setSearch] = useState('')
  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads', companyId, 'manual-picker'],
    queryFn: () => getLeadsByCompany(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  })

  const selected = useMemo(() => new Set(value), [value])
  const filtered = useMemo(() => {
    const list = (leads ?? []).filter((l) => !!l.phone)
    const term = search.trim().toLowerCase()
    if (!term) return list
    return list.filter(
      (l) => (l.name ?? '').toLowerCase().includes(term) || (l.phone ?? '').includes(term),
    )
  }, [leads, search])

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{value.length} contato(s) selecionado(s)</p>
      <div className="max-h-56 overflow-y-auto rounded-md border">
        {isLoading ? (
          <div className="space-y-1 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
        ) : (
          filtered.map((l) => {
            const on = selected.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                className={cn(
                  'flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/40',
                  on && 'bg-primary/5',
                )}
              >
                <span>
                  <span className="font-medium">{l.name || 'Sem nome'}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{l.phone}</span>
                </span>
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border text-[10px]',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {on ? '✓' : ''}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
