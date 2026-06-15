import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, UserPlus, FileText, Flame, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardLeads } from '@/hooks/use-dashboard-leads'
import { useDashboardStages } from '@/hooks/use-dashboard-stages'
import { useDashboardDeals } from '@/hooks/use-deals'
import { buildActiveDealInfo, type ActiveDealInfo } from '@/lib/active-deal-info'
import type { LeadWithDetails, PipelineStage } from '@/types/database'

interface ActionItem {
  key: string
  icon: typeof UserPlus
  label: string
  count: number
  badgeClass: string
  filter: string
}

const getStageBySlug = (stages: PipelineStage[], slug: string) =>
  stages.find((s) => s.slug === slug)

const isToday = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

const hoursAgo = (dateStr: string, hours: number) => {
  const threshold = new Date()
  threshold.setHours(threshold.getHours() - hours)
  return new Date(dateStr) < threshold
}

const daysAgo = (dateStr: string, days: number) => {
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - days)
  return new Date(dateStr) < threshold
}

const buildActions = (leads: LeadWithDetails[], stages: PipelineStage[], dealInfo: ActiveDealInfo): ActionItem[] => {
  // "Ativo" e o stage por lead agora vem de deals (negocio aberto mais recente),
  // nao mais de leads.stage_id. Campos de contato seguem vindo do lead.
  const activeLeads = leads.filter((l) => dealInfo.activeLeadIds.has(l.id))

  const proposalStage = getStageBySlug(stages, 'proposta') ?? getStageBySlug(stages, 'proposal')
  const negotiationStage = getStageBySlug(stages, 'negociacao') ?? getStageBySlug(stages, 'negotiation')

  const newNoContact = activeLeads.filter(
    (l) => isToday(l.created_at) && l.conversation_status === 'unread'
  ).length

  const proposalStale = proposalStage
    ? activeLeads.filter(
        (l) => dealInfo.stageByLeadId.get(l.id) === proposalStage.id && daysAgo(l.updated_at, 7)
      ).length
    : 0

  const hotNoContact = activeLeads.filter(
    (l) =>
      (l.temperature === 'fire' || l.temperature === 'hot') &&
      hoursAgo(l.updated_at, 24)
  ).length

  const negotiationStuck = negotiationStage
    ? activeLeads.filter(
        (l) => dealInfo.stageByLeadId.get(l.id) === negotiationStage.id && daysAgo(l.updated_at, 3)
      ).length
    : 0

  const waitingInternal = activeLeads.filter(
    (l) => l.conversation_status === 'waiting_internal'
  ).length

  return [
    {
      key: 'new-no-contact',
      icon: UserPlus,
      label: 'Leads novos sem contato hoje',
      count: newNoContact,
      badgeClass: 'bg-blue-500/15 text-blue-500',
      filter: '?action=new_no_contact',
    },
    {
      key: 'proposal-stale',
      icon: FileText,
      label: 'Propostas vencendo esta semana',
      count: proposalStale,
      badgeClass: 'bg-orange-500/15 text-orange-500',
      filter: proposalStage ? `?stage=${proposalStage.id}&stale=7` : '',
    },
    {
      key: 'hot-no-contact',
      icon: Flame,
      label: 'Leads quentes sem contato há 24h',
      count: hotNoContact,
      badgeClass: 'bg-red-500/15 text-red-500',
      filter: '?temperature=hot&stale=1',
    },
    {
      key: 'negotiation-stuck',
      icon: AlertTriangle,
      label: 'Negociações paradas há 3+ dias',
      count: negotiationStuck,
      badgeClass: 'bg-yellow-500/15 text-yellow-500',
      filter: negotiationStage ? `?stage=${negotiationStage.id}&stale=3` : '',
    },
    {
      key: 'waiting-internal',
      icon: Clock,
      label: 'Leads aguardando retorno',
      count: waitingInternal,
      badgeClass: 'bg-muted-foreground/15 text-muted-foreground',
      filter: '?conversation_status=waiting_internal',
    },
  ].filter((item) => item.count > 0)
}

const NextActionsCard = ({ pipelineId }: { pipelineId?: string | null }) => {
  const { data: leads, isLoading: leadsLoading } = useDashboardLeads(pipelineId)
  const { data: stages, isLoading: stagesLoading } = useDashboardStages(pipelineId)
  const { data: deals, isLoading: dealsLoading } = useDashboardDeals(pipelineId)
  const navigate = useNavigate()

  const actions = useMemo(() => {
    if (!leads || !stages || !deals) return []
    return buildActions(leads, stages, buildActiveDealInfo(deals))
  }, [leads, stages, deals])

  const isLoading = leadsLoading || stagesLoading || dealsLoading

  if (isLoading) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <Skeleton className="h-5 w-36 mb-1" />
        <Skeleton className="h-3 w-52 mb-5" />
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-0.5">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Próximas Ações</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Sugestões baseadas nos seus dados
      </p>

      {actions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary/40" />
          <p className="text-sm text-muted-foreground">
            Tudo em dia! Nenhuma ação urgente.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {actions.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(`/pipeline${item.filter}`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-smooth hover:bg-muted/40"
            >
              <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">{item.label}</span>
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums', item.badgeClass)}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { NextActionsCard }
