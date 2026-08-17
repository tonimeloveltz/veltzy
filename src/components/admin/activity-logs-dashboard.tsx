import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useActivityLogs } from '@/hooks/use-activity-logs'
import { timeAgo } from '@/lib/time'

const actionLabels: Record<string, string> = {
  created: 'Criou',
  stage_changed: 'Mudou fase',
  assigned: 'Atribuiu',
  queue_distributed: 'Distribuiu da fila',
  status_changed: 'Mudou status',
  value_changed: 'Mudou valor'
}

const ActivityLogsDashboard = () => {
  const { data: logs, isLoading } = useActivityLogs()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs de Atividade</CardTitle>
        <CardDescription>Historico de acoes no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

        {!isLoading && logs?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum log registrado</p>
        )}

        <div className="space-y-1">
          {logs?.map((log) => (
            <div key={log.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/30 transition-smooth text-xs">
              <span className="text-muted-foreground/60 w-16 shrink-0">{timeAgo(log.created_at)}</span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium shrink-0">
                {actionLabels[log.action] ?? log.action}
              </span>
              <span className="text-muted-foreground">{log.resource_type}</span>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <span className="text-muted-foreground/50 truncate flex-1">
                  {JSON.stringify(log.metadata).slice(0, 80)}
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export { ActivityLogsDashboard }
