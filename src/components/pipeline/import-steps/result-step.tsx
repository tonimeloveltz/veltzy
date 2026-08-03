import { CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ImportBatchResult } from '@/services/import-leads.service'
import { cn } from '@/lib/utils'

interface ResultStepProps {
  result: ImportBatchResult
  onClose: () => void
}

const StatCard = ({ icon: Icon, label, value, color }: {
  icon: typeof CheckCircle2
  label: string
  value: number
  color: string
}) => (
  <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', color)}>
    <Icon className="h-5 w-5 shrink-0" />
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  </div>
)

const downloadReport = (result: ImportBatchResult) => {
  const headers = ['Linha,Status,Motivo']
  const rows = result.results.map((r) =>
    `${r.rowIndex + 2},${r.status},${r.reason ?? ''}`
  )
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `importacao-relatorio-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const ResultStep = ({ result, onClose }: ResultStepProps) => {
  const problemRows = result.results.filter((r) => r.status !== 'success')

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Resultado da importacao</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={CheckCircle2} label="Importados" value={result.inserted} color="text-emerald-600" />
        <StatCard icon={AlertTriangle} label="Pulados" value={result.skipped} color="text-amber-600" />
        <StatCard icon={XCircle} label="Erros" value={result.errors} color="text-destructive" />
      </div>

      {problemRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Detalhes</p>
          <div className="max-h-[200px] overflow-x-auto overflow-y-auto rounded-lg border scrollbar-minimal">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 sticky top-0">
                  <th className="px-3 py-2 text-left font-medium">Linha</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {problemRows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{r.rowIndex + 2}</td>
                    <td className={cn('px-3 py-1.5', r.status === 'skipped' ? 'text-amber-600' : 'text-destructive')}>
                      {r.status === 'skipped' ? 'Pulado' : 'Erro'}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        {problemRows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => downloadReport(result)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Baixar relatorio
          </Button>
        )}
        <div className="ml-auto">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  )
}

export { ResultStep }
