import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useSellerPerformance } from '@/hooks/use-dashboard-metrics'
import { useRoles } from '@/hooks/use-roles'

interface SellerPerformanceTableProps {
  days?: number
  pipelineId?: string | null
}

const SellerPerformanceTable = ({ days, pipelineId }: SellerPerformanceTableProps) => {
  const { data: sellers, isLoading } = useSellerPerformance(days, pipelineId)
  const { isAdmin, isManager } = useRoles()

  if (!isAdmin && !isManager) return null

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Performance dos Vendedores</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!sellers?.length) return null

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Performance dos Vendedores</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              <th className="pb-3 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Vendedor</th>
              <th className="pb-3 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Contatos</th>
              <th className="pb-3 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Negócios</th>
              <th className="pb-3 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Conversão</th>
              <th className="pb-3 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Tempo Resp.</th>
              <th className="pb-3 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map((s) => {
              const initials = s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              return (
                <tr key={s.profile_id} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-smooth">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-medium">{s.leads_count}</td>
                  <td className="py-3 text-right">
                    <span className="font-semibold text-emerald-500">{s.deals_count}</span>
                  </td>
                  <td className="py-3 text-right">{s.conversion_rate}%</td>
                  <td className="py-3 text-right">
                    {s.avg_response_minutes != null ? (
                      <span className={cn(s.avg_response_minutes <= 5 ? 'text-primary' : s.avg_response_minutes <= 15 ? 'text-yellow-500' : 'text-destructive')}>
                        {s.avg_response_minutes}min
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">-</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', s.is_available ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-muted-foreground/20')} />
                      <span className="text-[10px] text-muted-foreground">{s.is_available ? 'Online' : 'Offline'}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { SellerPerformanceTable }
