import type { ConversationStatus, DealStatus, LeadTemperature } from '@/types/database'

export interface TemperatureConfig {
  /** Label pt-BR. Reaproveitado no export: precisa casar com TEMP_MAP do import. */
  label: string
  color: string
  bgColor: string
  borderColor: string
  /** Dot compacto das tabelas de Contatos e Negocios. */
  dotColor: string
  /** Barra de temperatura (card do kanban, inbox, modal de edicao). */
  width: string
  gradient: string
}

export const leadTemperatureConfig: Record<LeadTemperature, TemperatureConfig> = {
  cold: {
    label: 'Frio',
    color: 'text-blue-400',   bgColor: 'bg-blue-500/10',   borderColor: 'border-blue-500/30',
    dotColor: 'bg-blue-400',
    width: '25%',  gradient: 'linear-gradient(to right, #bfdbfe, #3b82f6)',
  },
  warm: {
    label: 'Morno',
    color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30',
    dotColor: 'bg-yellow-500',
    width: '50%',  gradient: 'linear-gradient(to right, #fde68a, #f59e0b)',
  },
  hot: {
    label: 'Quente',
    color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30',
    dotColor: 'bg-orange-500',
    width: '75%',  gradient: 'linear-gradient(to right, #fed7aa, #f97316)',
  },
  fire: {
    label: 'Pegando Fogo',
    color: 'text-red-400',    bgColor: 'bg-red-500/10',    borderColor: 'border-red-500/30',
    dotColor: 'bg-red-500',
    width: '100%', gradient: 'linear-gradient(to right, #f97316, #ef4444, #dc2626)',
  },
}

export interface DealStatusConfig {
  /** Label pt-BR canonico, usado na UI e no relatorio exportado. */
  label: string
  /** Badge completo (fundo + texto) das tabelas. */
  className: string
  /** Dot compacto do painel de negocios do inbox. */
  dotColor: string
}

export const dealStatusConfig: Record<DealStatus, DealStatusConfig> = {
  open:               { label: 'Aberto',                className: 'bg-yellow-500/15 text-yellow-500',                    dotColor: 'bg-yellow-500' },
  won:                { label: 'Ganho',                 className: 'bg-emerald-500/15 text-emerald-500',                  dotColor: 'bg-emerald-500' },
  lost:               { label: 'Perdido',               className: 'bg-red-500/15 text-red-500',                          dotColor: 'bg-red-500' },
  archived:           { label: 'Arquivado',             className: 'bg-muted text-muted-foreground',                      dotColor: 'bg-muted-foreground' },
  pending_assignment: { label: 'Aguardando atribuição', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',  dotColor: 'bg-amber-500' },
}

/** Labels pt-BR do status de conversa (leads.conversation_status), usados no relatorio exportado. */
export const conversationStatusLabels: Record<ConversationStatus, string> = {
  unread: 'Não lida',
  read: 'Lida',
  replied: 'Respondida',
  waiting_client: 'Aguardando cliente',
  waiting_internal: 'Aguardando interno',
  resolved: 'Resolvida',
}
