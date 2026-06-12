import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { usePipelineStore } from '@/stores/pipeline.store'
import { LeadSourceBadge } from '@/components/pipeline/lead-source-badge'
import { DealValueDialog } from '@/components/pipeline/deal-value-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useRoles } from '@/hooks/use-roles'
import { useLeadTaskCount } from '@/hooks/use-tasks'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useMoveLeadToStage, useUpdateDealValueAndMove } from '@/hooks/use-leads'
import { timeAgo } from '@/lib/time'
import type { LeadWithDetails } from '@/types/database'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, MoreVertical, Pencil, ArrowRightLeft, UserRoundPen, Clock, MessageSquare, Bot, CheckSquare, FolderInput, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { LeadTemperature } from '@/types/database'

function isProposalStage(slug: string) {
  return slug.includes('proposta') || slug.includes('proposal')
}

function needsDealValueWarning(lead: LeadWithDetails, stages: { id: string; slug: string; position: number }[] | undefined) {
  if (!stages || (lead.deal_value && lead.deal_value > 0)) return false
  const currentStage = stages.find((s) => s.id === lead.stage_id)
  if (!currentStage) return false
  const proposalStage = stages.find((s) => isProposalStage(s.slug))
  if (!proposalStage) return false
  return currentStage.position >= proposalStage.position
}

interface LeadCardProps {
  lead: LeadWithDetails
  onTransfer?: (leadId: string) => void
  onMovePipeline?: (lead: LeadWithDetails) => void
  fireOnly?: boolean
}

const temperatureConfig: Record<LeadTemperature, { width: string; gradient: string }> = {
  cold:  { width: '25%',  gradient: 'linear-gradient(to right, #bfdbfe, #3b82f6)' },
  warm:  { width: '50%',  gradient: 'linear-gradient(to right, #fde68a, #f59e0b)' },
  hot:   { width: '75%',  gradient: 'linear-gradient(to right, #fed7aa, #f97316)' },
  fire:  { width: '100%', gradient: 'linear-gradient(to right, #f97316, #ef4444, #dc2626)' },
}

const TemperatureBar = ({ temperature }: { temperature: LeadTemperature }) => {
  const config = temperatureConfig[temperature]
  return (
    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: config.width, background: config.gradient }}
      />
    </div>
  )
}

const LeadCard = ({ lead, onTransfer, onMovePipeline, fireOnly }: LeadCardProps) => {
  const navigate = useNavigate()
  const setSelectedLeadId = usePipelineStore((s) => s.setSelectedLeadId)
  const { isAdmin, isManager } = useRoles()
  const { data: taskCount } = useLeadTaskCount(lead.id)
  const { data: stages } = usePipelineStages()
  const moveToStage = useMoveLeadToStage()
  const updateDealValueAndMove = useUpdateDealValueAndMove()
  const [dealValuePending, setDealValuePending] = useState<{ stageId: string } | null>(null)
  const showDealWarning = needsDealValueWarning(lead, stages)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const avatarSrc = lead.avatar_url || undefined

  const assigneeName = lead.profiles?.name
  const assigneeInitials = assigneeName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'kanban-card glass-card rounded-lg p-3 cursor-grab active:cursor-grabbing animate-fade-in',
        isDragging && 'opacity-50 scale-105 shadow-xl z-50',
        lead.temperature === 'fire' && fireOnly && 'fire-card overflow-hidden'
      )}
      onClick={() => setSelectedLeadId(lead.id)}
    >
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={avatarSrc} alt={lead.name ?? ''} />
            <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
              {(lead.name || lead.phone).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {lead.name || lead.phone}
            </p>
            {lead.name && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {lead.phone}
              </p>
            )}
            {lead.email && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="truncate">{lead.email}</span>
              </p>
            )}
            {lead.whatsapp_instance_name && (
              <span className="text-[9px] text-muted-foreground/60 bg-muted px-1 py-0.5 rounded shrink-0 w-fit">
                ...{lead.whatsapp_instance_name.slice(-4)}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-smooth"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setSelectedLeadId(lead.id)}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Mover para
              </DropdownMenuLabel>
              {stages
                ?.filter((s) => s.id !== lead.stage_id)
                .map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => {
                      if (isProposalStage(s.slug) && (!lead.deal_value || lead.deal_value <= 0)) {
                        setDealValuePending({ stageId: s.id })
                        return
                      }
                      moveToStage.mutate({ leadId: lead.id, stageId: s.id })
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </DropdownMenuItem>
                ))}

              {(isAdmin || isManager) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onTransfer?.(lead.id)}>
                    <UserRoundPen className="h-4 w-4" />
                    Transferir lead
                  </DropdownMenuItem>
                  {onMovePipeline && (
                    <DropdownMenuItem onClick={() => onMovePipeline(lead)}>
                      <FolderInput className="h-4 w-4" />
                      Mover para pipeline...
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-0.5">
            {lead.is_ai_active && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="p-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary opacity-70" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">Atendido pela IA SDR</TooltipContent>
              </Tooltip>
            )}
            {lead.transfer_summary && !lead.is_ai_active && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="p-0.5">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-amber-500 opacity-70" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="font-medium text-xs mb-1">Transferido do SDR</p>
                  <p className="text-xs opacity-80">{lead.transfer_summary}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/inbox?lead=${lead.id}`)
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-primary transition-smooth cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
          </div>
        </div>

        <TemperatureBar temperature={lead.temperature} />

        {showDealWarning && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const proposalStage = stages?.find((s) => isProposalStage(s.slug))
              if (proposalStage) setDealValuePending({ stageId: lead.stage_id })
            }}
            className="flex items-center gap-1.5 w-full rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Valor do negocio obrigatorio
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          <LeadSourceBadge source={lead.lead_sources} />
          <div className="flex items-center gap-2">
            {lead.deal_value ? (
              <span className="text-xs font-semibold text-primary">
                R$ {lead.deal_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            ) : null}
            {assigneeName && (
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {assigneeInitials}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {lead.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tag}
              </span>
            ))}
            {lead.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 3}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {(taskCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-primary/70">
                <CheckSquare className="h-2.5 w-2.5" />
                {taskCount}
              </span>
            )}
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo(lead.created_at)}
            </span>
          </div>
        </div>
      </div>

      <DealValueDialog
        open={!!dealValuePending}
        onOpenChange={(open) => { if (!open) setDealValuePending(null) }}
        leadName={lead.name || lead.phone}
        onConfirm={(value) => {
          if (!dealValuePending) return
          updateDealValueAndMove.mutate({
            leadId: lead.id,
            stageId: dealValuePending.stageId,
            dealValue: value,
          })
          setDealValuePending(null)
        }}
      />
    </div>
  )
}

export { LeadCard }
