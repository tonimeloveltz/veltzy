import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { buildActiveDealInfo } from '@/lib/active-deal-info'
import { useDealsByLead } from '@/hooks/use-deals'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Kanban, Phone, PanelRight } from 'lucide-react'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useIsPanelInline } from '@/hooks/use-panel-inline'
import { useInboxStore } from '@/stores/inbox.store'
import { leadDisplayName } from '@/lib/phone'
import type { LeadWithLastMessage } from '@/types/database'

interface ChatHeaderProps {
  lead: LeadWithLastMessage
}

const ChatHeader = ({ lead }: ChatHeaderProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: pipelines } = useAccessiblePipelines()
  const { data: whatsappStatus } = useWhatsAppStatus()
  const { contactPanelOpen, toggleContactPanel } = useInboxStore()
  const panelIsInline = useIsPanelInline()
  const panelOpen = contactPanelOpen ?? panelIsInline
  const showInstanceBadge = whatsappStatus?.provider === 'evolution' || whatsappStatus?.provider === 'cloud_api'
  const avatarSrc = lead.avatar_url || undefined

  // D9: o pipeline e do negocio, nao do contato. Usa a regra unica (R1) do
  // `buildActiveDealInfo`: negocio ABERTO mais recente por `created_at`.
  // Contato sem negocio aberto nao tem pipeline, e ai o badge some em vez de
  // aparecer vazio, reaproveitando o mesmo caminho de "nao mostrar" que ja
  // existe para empresa com um pipeline so.
  const { data: leadDeals } = useDealsByLead(lead.id)
  const activePipelineId = useMemo(
    () => buildActiveDealInfo(leadDeals).pipelineByLeadId.get(lead.id) ?? null,
    [leadDeals, lead.id],
  )

  const pipelineName = pipelines && pipelines.length > 1 && activePipelineId
    ? pipelines.find((p) => p.id === activePipelineId)?.name
    : null

  return (
    <div className="flex items-center gap-2 border-b px-3 py-3 lg:gap-3 lg:px-4">
      <button
        onClick={() =>
          location.state?.fromList
            ? navigate(-1)
            : navigate('/inbox', { replace: true })
        }
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-smooth hover:bg-accent lg:hidden"
        aria-label="Voltar para conversas"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

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
          onClick={() => toggleContactPanel(panelOpen)}
          title="Painel de contato"
        >
          <PanelRight className={cn('h-4 w-4', panelOpen && 'text-primary')} />
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
      </div>
    </div>
  )
}

export { ChatHeader }
