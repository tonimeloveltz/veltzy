import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { periodStartMs } from '@/lib/period-range'
import { useDashboardDeals } from '@/hooks/use-deals'
import { useTeamMembers } from '@/hooks/use-team'
import type { DealWithLead } from '@/types/database'

// Mesma janela do seletor do dashboard (hoje / semana corrente / mes corrente):
// vem de `periodStartMs` para o card nao contar um recorte diferente do dos KPIs.
const filterByPeriod = (deals: DealWithLead[], days: number | undefined) => {
  const start = periodStartMs(days, Date.now())
  if (start === null) return deals
  return deals.filter((d) => new Date(d.created_at).getTime() >= start)
}

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()

const TeamHighlightCard = ({ days, pipelineId }: { days?: number; pipelineId?: string | null }) => {
  const { data: allDeals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)
  const { data: members, isLoading: membersLoading } = useTeamMembers()

  const sellers = useMemo(() => {
    if (!allDeals || !members) return []
    const deals = filterByPeriod(allDeals, days)

    return members
      .map((m) => {
        const myDeals = deals.filter((d) => d.assigned_to === m.id)
        const won = myDeals.filter((d) => d.status === 'won').length
        const conversion = myDeals.length > 0 ? Math.round((won / myDeals.length) * 100) : 0
        return { id: m.id, name: m.name, deals: won, conversion, leadsCount: myDeals.length, isAvailable: m.is_available }
      })
      .filter((s) => s.leadsCount > 0)
      .sort((a, b) => b.deals - a.deals)
      .slice(0, 5)
  }, [allDeals, members, days])

  const isLoading = dealsLoading || membersLoading

  if (isLoading) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <Skeleton className="h-5 w-36 mb-4" />
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

  if (sellers.length === 0) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Equipe em Destaque</h3>
        </div>
        <p className="text-xs text-muted-foreground text-center py-6">Nenhum vendedor com leads no periodo</p>
      </div>
    )
  }

  const maxDeals = Math.max(...sellers.map((s) => s.deals), 1)

  return (
    <div className="bg-card border border-border/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Equipe em Destaque</h3>
      </div>
      <div className="space-y-3">
        {sellers.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                {getInitials(s.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate">{s.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-primary">{s.deals} deals</span>
                  <span className={cn('h-1.5 w-1.5 rounded-full', s.isAvailable ? 'bg-green-500' : 'bg-muted-foreground/30')} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max((s.deals / maxDeals) * 100, 4)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-8 text-right">{s.conversion}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { TeamHighlightCard }
