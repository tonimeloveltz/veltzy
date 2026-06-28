import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Kanban, CheckCircle, Phone, PanelRight } from 'lucide-react'
import { useUpdateLead } from '@/hooks/use-leads'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useInboxStore } from '@/stores/inbox.store'
import { leadDisplayName } from '@/lib/phone'
import type { LeadWithLastMessage } from '@/types/database'

interface ChatHeaderProps {
  lead: LeadWithLastMessage
}

const ChatHeader = ({ lead }: ChatHeaderProps) => {
  const navigate = useNavigate()
  const updateLead = useUpdateLead()
  const { data: pipelines } = useAccessiblePipelines()
  const { data: whatsappStatus } = useWhatsAppStatus()
  const { contactPanelOpen, toggleContactPanel } = useInboxStore()
  const showInstanceBadge = whatsappStatus?.provider === 'evolution' || whatsappStatus?.provider === 'cloud_api'
  const avatarSrc = lead.avatar_url || undefined

  const pipelineName = pipelines && pipelines.length > 1
    ? pipelines.find((p) => p.id === lead.pipeline_id)?.name
    : null

  const handleResolve = () => {
    updateLead.mutate({ leadId: lead.id, data: { conversation_status: 'resolved' } })
  }

  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <Avatar className="h-9 w-9">
        <AvatarImage src={avatarSrc} alt={lead.name ?? ''} />
        <AvatarFallback className="text-xs bg-secondary">
          {leadDisplayName(lead.name, lead.phone).slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{leadDisplayName(lead.name, lead.phone)}</p>
        {lead.company_name && (
          <p className="text-[11px] text-muted-foreground/70 truncate">{lead.company_name}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {lead.phone}
          {pipelineName && <span className="ml-1.5 text-muted-foreground/60">· {pipelineName}</span>}
        </p>
        {showInstanceBadge && lead.whatsapp_instance_name && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
            <Phone className="h-2.5 w-2.5" />
            {lead.whatsapp_instance_name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {lead.ai_score > 0 && (
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            Score: {lead.ai_score}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleContactPanel}
          title="Painel de contato"
        >
          <PanelRight className={cn('h-4 w-4', contactPanelOpen && 'text-primary')} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate('/pipeline')}
          title="Ver no Pipeline"
        >
          <Kanban className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleResolve}>
              <CheckCircle className="h-4 w-4" />
              Marcar como resolvido
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export { ChatHeader }
