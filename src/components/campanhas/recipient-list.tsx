import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecipientDetail } from '@/services/campaigns.service'
import type { BlastRecipientStatus } from '@/types/database'

interface RecipientListProps {
  recipients: RecipientDetail[]
}

const statusLabel: Record<BlastRecipientStatus, string> = {
  pending: 'Pendente',
  queued: 'Na fila',
  sent: 'Enviado',
  failed: 'Falhou',
  skipped: 'Pulado',
}

const statusTone: Record<BlastRecipientStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  queued: 'bg-amber-500/15 text-amber-600',
  sent: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
  skipped: 'bg-muted text-muted-foreground',
}

const StatusBadge = ({ status }: { status: BlastRecipientStatus }) => (
  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusTone[status])}>
    {statusLabel[status]}
  </span>
)

export function RecipientList({ recipients }: RecipientListProps) {
  if (!recipients.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <Users className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Nenhum contato ainda</p>
        <p className="text-sm text-muted-foreground">
          Os contatos aparecem aqui quando a campanha é disparada.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Contato</th>
            <th className="px-4 py-2.5 font-medium">Telefone</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Mensagem</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => {
            const error = r.error_message ?? r.queue?.error_message ?? null
            return (
              <tr key={r.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.lead?.name || 'Sem nome'}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.phone}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="whitespace-pre-wrap">{r.queue?.content}</span>
                  {r.status === 'failed' && error && (
                    <p className="mt-1 text-xs text-red-600">{error}</p>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
