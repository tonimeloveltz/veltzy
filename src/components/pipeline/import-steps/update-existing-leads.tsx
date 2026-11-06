import { useState } from 'react'
import { CheckCircle2, UserPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useApplyLeadUpdates } from '@/hooks/use-apply-lead-updates'
import type { LeadUpdateSuggestion } from '@/lib/import-lead-updates'
import type { ApplyUpdatesResult } from '@/services/import-leads.service'

interface UpdateExistingLeadsProps {
  suggestions: LeadUpdateSuggestion[]
}

const describeChange = (s: LeadUpdateSuggestion): string =>
  [s.newName && `Nome: ${s.newName}`, s.newEmail && `Email: ${s.newEmail}`].filter(Boolean).join(' · ')

const UpdateExistingLeads = ({ suggestions }: UpdateExistingLeadsProps) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map((s) => s.leadId)))
  const [done, setDone] = useState<ApplyUpdatesResult | null>(null)
  const applyUpdates = useApplyLeadUpdates()

  const allSelected = selected.size === suggestions.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(suggestions.map((s) => s.leadId)))
  const toggle = (leadId: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(leadId)) next.delete(leadId)
    else next.add(leadId)
    return next
  })

  const handleApply = async () => {
    const chosen = suggestions.filter((s) => selected.has(s.leadId))
    if (chosen.length === 0) return
    const res = await applyUpdates.mutateAsync(chosen)
    setDone(res)
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          {done.updated} {done.updated === 1 ? 'lead atualizado' : 'leads atualizados'} com os dados da planilha
          {done.failed > 0 && <span className="text-destructive">, {done.failed} com falha</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <UserPen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">
            {suggestions.length} {suggestions.length === 1 ? 'lead já cadastrado está' : 'leads já cadastrados estão'} com dados faltando
          </p>
          <p className="text-xs text-muted-foreground">
            A planilha tem o que falta no CRM. Escolha quais completar. Nada que já está preenchido é alterado.
          </p>
        </div>
      </div>

      <div className="max-h-[180px] overflow-y-auto rounded-md border scrollbar-minimal">
        <table className="w-full text-xs">
          <thead>
            <tr className="sticky top-0 bg-muted/50">
              <th className="w-8 px-3 py-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Marcar todos" />
              </th>
              <th className="px-3 py-2 text-left font-medium">Telefone</th>
              <th className="px-3 py-2 text-left font-medium">Hoje no CRM</th>
              <th className="px-3 py-2 text-left font-medium">Vai ficar</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={s.leadId} className="cursor-pointer border-t" onClick={() => toggle(s.leadId)}>
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(s.leadId)} onCheckedChange={() => toggle(s.leadId)} aria-label={`Atualizar ${s.phone}`} />
                </td>
                <td className="px-3 py-1.5 tabular-nums">{s.phone}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{s.currentName?.trim() || 'Sem nome'}</td>
                <td className="px-3 py-1.5">{describeChange(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleApply} disabled={selected.size === 0 || applyUpdates.isPending}>
          {applyUpdates.isPending
            ? 'Atualizando...'
            : `Atualizar ${selected.size} ${selected.size === 1 ? 'lead' : 'leads'}`}
        </Button>
      </div>
    </div>
  )
}

export { UpdateExistingLeads }
