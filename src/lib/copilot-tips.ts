import type { LucideIcon } from 'lucide-react'
import { UserPlus, FileText, Flame, AlertTriangle, Clock } from 'lucide-react'
import type { LeadWithDetails, PipelineStage } from '@/types/database'
import type { ActiveDealInfo } from '@/lib/active-deal-info'

/** Regra 2 — proposta parada ha 7+ dias (herdado de buildActions). */
export const PROPOSAL_STALE_DAYS = 7
/** Regra 3 — lead quente sem contato ha 24+ horas (herdado). */
export const HOT_STALE_HOURS = 24
/** Regra 4 — negociacao parada ha 3+ dias (herdado). */
export const NEGOTIATION_STALE_DAYS = 3

export type CopilotTipPriority = 'alta' | 'media' | 'baixa'

export interface CopilotTip {
  /** Identificador estavel da regra. Reusa as MESMAS keys de buildActions para
   *  facilitar a validacao de paridade regra a regra. */
  key: string
  /** Icone Lucide da dica (mesmo icone da regra correspondente em buildActions). */
  icon: LucideIcon
  /** Texto exibido, herdado 1:1 de buildActions (inclusive acentuacao). */
  label: string
  /** Contagem de leads que satisfazem a regra. A dica so entra na lista se count > 0. */
  count: number
  /** Prioridade para ordenacao e cor do icone. */
  priority: CopilotTipPriority
  /** Rota de navegacao completa, ja com o filtro (ex: '/pipeline?action=new_no_contact'). */
  navigateTo: string
}

// Helpers de tempo e resolucao de stage por slug, movidos de next-actions-card.tsx.
// Comportamento identico ao original para preservar a paridade de contagem.

export const isToday = (dateStr: string): boolean => {
  const date = new Date(dateStr)
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

export const hoursAgo = (dateStr: string, hours: number): boolean => {
  const threshold = new Date()
  threshold.setHours(threshold.getHours() - hours)
  return new Date(dateStr) < threshold
}

export const daysAgo = (dateStr: string, days: number): boolean => {
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - days)
  return new Date(dateStr) < threshold
}

/** Resolucao de stage por slug (identica a getStageBySlug de buildActions). */
export const getStageBySlug = (
  stages: PipelineStage[],
  slug: string,
): PipelineStage | undefined => stages.find((s) => s.slug === slug)

const PRIORITY_WEIGHT: Record<CopilotTipPriority, number> = {
  alta: 0,
  media: 1,
  baixa: 2,
}

/**
 * Builder puro das dicas do Copiloto. Porta as 5 regras de buildActions
 * (next-actions-card.tsx) com os mesmos thresholds e condicoes, calculando tudo
 * no cliente sobre os dados ja buscados. Sem hooks, sem side effects.
 *
 * "Ativo" = lead em dealInfo.activeLeadIds (tem deal com status 'open'); o stage
 * do lead vem de dealInfo.stageByLeadId (deal aberto mais recente), nunca de
 * leads.stage_id. Campos de contato seguem vindo do lead.
 */
export const buildCopilotTips = (
  leads: LeadWithDetails[],
  stages: PipelineStage[],
  dealInfo: ActiveDealInfo,
): CopilotTip[] => {
  const activeLeads = leads.filter((l) => dealInfo.activeLeadIds.has(l.id))

  const proposalStage = getStageBySlug(stages, 'proposta') ?? getStageBySlug(stages, 'proposal')
  const negotiationStage = getStageBySlug(stages, 'negociacao') ?? getStageBySlug(stages, 'negotiation')

  const newNoContact = activeLeads.filter(
    (l) => isToday(l.created_at) && l.conversation_status === 'unread'
  ).length

  const proposalStale = proposalStage
    ? activeLeads.filter(
        (l) => dealInfo.stageByLeadId.get(l.id) === proposalStage.id && daysAgo(l.updated_at, PROPOSAL_STALE_DAYS)
      ).length
    : 0

  const hotNoContact = activeLeads.filter(
    (l) =>
      (l.temperature === 'fire' || l.temperature === 'hot') &&
      hoursAgo(l.updated_at, HOT_STALE_HOURS)
  ).length

  const negotiationStuck = negotiationStage
    ? activeLeads.filter(
        (l) => dealInfo.stageByLeadId.get(l.id) === negotiationStage.id && daysAgo(l.updated_at, NEGOTIATION_STALE_DAYS)
      ).length
    : 0

  const waitingInternal = activeLeads.filter(
    (l) => l.conversation_status === 'waiting_internal'
  ).length

  const tips: CopilotTip[] = [
    {
      key: 'new-no-contact',
      icon: UserPlus,
      label: 'Leads novos sem contato hoje',
      count: newNoContact,
      priority: 'media',
      navigateTo: '/pipeline?action=new_no_contact',
    },
    {
      key: 'proposal-stale',
      icon: FileText,
      label: 'Propostas vencendo esta semana',
      count: proposalStale,
      priority: 'media',
      navigateTo: proposalStage ? `/pipeline?stage=${proposalStage.id}&stale=7` : '',
    },
    {
      key: 'hot-no-contact',
      icon: Flame,
      label: 'Leads quentes sem contato há 24h',
      count: hotNoContact,
      priority: 'alta',
      navigateTo: '/pipeline?temperature=hot&stale=1',
    },
    {
      key: 'negotiation-stuck',
      icon: AlertTriangle,
      label: 'Negociações paradas há 3+ dias',
      count: negotiationStuck,
      priority: 'alta',
      navigateTo: negotiationStage ? `/pipeline?stage=${negotiationStage.id}&stale=3` : '',
    },
    {
      key: 'waiting-internal',
      icon: Clock,
      label: 'Leads aguardando retorno',
      count: waitingInternal,
      priority: 'baixa',
      navigateTo: '/pipeline?conversation_status=waiting_internal',
    },
  ]

  return tips
    .filter((t) => t.count > 0)
    .map((tip, index) => ({ tip, index }))
    .sort((a, b) => {
      const byPriority = PRIORITY_WEIGHT[a.tip.priority] - PRIORITY_WEIGHT[b.tip.priority]
      return byPriority !== 0 ? byPriority : a.index - b.index
    })
    .map(({ tip }) => tip)
}
