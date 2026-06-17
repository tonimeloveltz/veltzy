import { useMemo } from 'react'
import { Lightbulb, AlertCircle, Flame, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeads } from '@/hooks/use-leads'
import { useDashboardDeals } from '@/hooks/use-deals'
import { buildActiveDealInfo } from '@/lib/active-deal-info'

const FollowUpTips = () => {
  const { data: leads, isLoading: leadsLoading } = useLeads()
  const { data: deals, isLoading: dealsLoading } = useDashboardDeals()

  const tips = useMemo(() => {
    if (!leads || !deals) return null

    // "Ativo" agora vem de deals (negocio aberto), nao de leads.stage_id.
    const { activeLeadIds } = buildActiveDealInfo(deals)
    const activeLeads = leads.filter((l) => activeLeadIds.has(l.id))

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    const staleLeads = activeLeads.filter(
      (l) => new Date(l.updated_at) < threeDaysAgo
    )

    const hotLeads = activeLeads.filter(
      (l) => l.temperature === 'fire' || l.temperature === 'hot'
    )

    const qualifiedLeads = activeLeads.filter((l) => l.ai_score > 70)

    return { staleLeads, hotLeads, qualifiedLeads }
  }, [leads, deals])

  const isLoading = leadsLoading || dealsLoading

  if (isLoading) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <Skeleton className="h-5 w-36 mb-1" />
        <Skeleton className="h-3 w-64 mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  const staleCount = tips?.staleLeads.length ?? 0
  const hotCount = tips?.hotLeads.length ?? 0
  const qualifiedCount = tips?.qualifiedLeads.length ?? 0

  const hotName = hotCount === 1 ? tips?.hotLeads[0]?.name ?? 'Lead' : ''

  const cards = [
    {
      icon: AlertCircle,
      iconColor: 'text-red-500',
      borderColor: 'border-red-500',
      title: `${staleCount} lead${staleCount !== 1 ? 's' : ''} sem interação`,
      badge: 'Urgente',
      badgeClass: 'bg-red-500/15 text-red-500',
      description: 'Leads sem atualização há mais de 3 dias precisam de follow-up para não esfriar.',
      count: staleCount,
    },
    {
      icon: Flame,
      iconColor: 'text-orange-500',
      borderColor: 'border-orange-500',
      title: hotCount === 1 ? 'Lead quente aguardando' : `${hotCount} leads quentes aguardando`,
      badge: 'Oportunidade',
      badgeClass: 'bg-orange-500/15 text-orange-500',
      description:
        hotCount === 1
          ? `${hotName} esta com temperatura alta. Priorize o contato para fechar!`
          : `${hotCount} leads com temperatura alta aguardando contato.`,
      count: hotCount,
    },
    {
      icon: TrendingUp,
      iconColor: 'text-green-500',
      borderColor: 'border-green-500',
      title: `${qualifiedCount} lead${qualifiedCount !== 1 ? 's' : ''} qualificado${qualifiedCount !== 1 ? 's' : ''}`,
      badge: 'Dica',
      badgeClass: 'bg-green-500/15 text-green-500',
      description: 'A IA identificou leads com alta probabilidade de conversão. Foque nesses contatos.',
      count: qualifiedCount,
    },
  ]

  return (
    <div className="bg-card border border-border/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-0.5">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Dicas de Follow-up</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Sugestões inteligentes baseadas nos seus leads
      </p>

      <div className="space-y-3">
        {cards.map((card) => (
          <div
            key={card.badge}
            className={cn(
              'border-l-4 rounded-lg bg-muted/20 p-3.5',
              card.borderColor
            )}
          >
            <div className="flex items-start gap-3">
              <card.icon className={cn('h-4 w-4 mt-0.5 shrink-0', card.iconColor)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">{card.title}</span>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', card.badgeClass)}>
                    {card.badge}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { FollowUpTips }
