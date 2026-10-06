import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useProspectMetrics } from '@/hooks/use-prospect-signals'

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-md border p-3">
    <div className="text-2xl font-semibold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
)

export const ProspectMetrics = () => {
  const { data: m, isLoading } = useProspectMetrics()
  if (isLoading || !m) return <Skeleton className="h-40 w-full" />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mensagens lidas" value={m.messagesRead} />
        <Stat label="DMs enviadas" value={m.dmsSent} />
        <Stat label="Respostas" value={m.responses} />
        <Stat label="Sinais (auto)" value={m.byDecision.auto_dm} />
      </div>

      <Card>
        <CardHeader><CardTitle>Sinais por faixa</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="auto_dm" value={m.byDecision.auto_dm} />
          <Stat label="review" value={m.byDecision.review} />
          <Stat label="alert" value={m.byDecision.alert} />
          <Stat label="discard" value={m.byDecision.discard} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Resolução de telefone por engine</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {m.resolutionByEngine.map((r) => {
            const pct = r.total ? Math.round((r.resolved / r.total) * 100) : 0
            return (
              <div key={r.engine} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span className="font-medium">{r.engine}</span>
                <span className="text-muted-foreground">{r.resolved}/{r.total} resolvidos · {pct}%</span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
