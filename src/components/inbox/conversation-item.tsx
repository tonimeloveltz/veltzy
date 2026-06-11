import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Clock } from 'lucide-react'
import { timeAgo } from '@/lib/time'
import { leadDisplayName } from '@/lib/phone'
import type { LeadWithLastMessage } from '@/types/database'

interface ConversationItemProps {
  lead: LeadWithLastMessage
  isSelected: boolean
  onClick: () => void
}

const statusDot: Record<string, string> = {
  unread: 'bg-blue-500',
  read: 'bg-muted-foreground/30',
  replied: 'bg-green-500',
  waiting_client: 'bg-yellow-500',
  waiting_internal: 'bg-orange-500',
  resolved: 'bg-muted-foreground/20',
}

const typeLabels: Record<string, string> = {
  image: '[Imagem]',
  audio: '[Audio]',
  video: '[Video]',
  document: '[Documento]',
  sticker: '[Sticker]',
  location: '[Localizacao]',
  contact: '[Contato]',
}

const messagePreview = (lead: LeadWithLastMessage): string => {
  const msg = lead.last_message
  if (!msg) return 'Sem mensagens'
  const prefix = msg.sender_type === 'human' ? 'Voce: ' : msg.sender_type === 'ai' ? 'IA: ' : ''
  if (msg.message_type !== 'text') {
    return prefix + (typeLabels[msg.message_type] ?? '[Mensagem]')
  }
  if (!msg.content) return prefix + '[Mensagem]'
  return prefix + msg.content
}

const getWaitingMinutes = (lead: LeadWithLastMessage): number | null => {
  if (!lead.last_customer_message_at) return null
  const lastMsg = lead.last_message
  // Se a ultima mensagem e do vendedor/IA, nao esta aguardando
  if (lastMsg && (lastMsg.sender_type === 'human' || lastMsg.sender_type === 'ai')) return null
  const diff = Date.now() - new Date(lead.last_customer_message_at).getTime()
  return Math.round(diff / 60000)
}

const ConversationItem = ({ lead, isSelected, onClick }: ConversationItemProps) => {
  const avatarSrc = lead.avatar_url || undefined
  const lastTime = lead.last_message?.created_at ?? lead.updated_at
  const waitingMinutes = getWaitingMinutes(lead)
  const isWarning = waitingMinutes !== null && waitingMinutes >= 15 && !lead.sla_breached

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-3 text-left transition-smooth border-l-4',
        isSelected
          ? 'bg-primary/10 border-l-primary'
          : lead.sla_breached
            ? 'border-l-destructive bg-destructive/5 hover:bg-destructive/10'
            : 'border-l-transparent hover:bg-muted/50'
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarImage src={avatarSrc} alt={lead.name ?? ''} />
          <AvatarFallback className="text-xs bg-secondary">
            {leadDisplayName(lead.name, lead.phone).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background', statusDot[lead.conversation_status])}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{leadDisplayName(lead.name, lead.phone)}</p>
          <div className="flex items-center gap-1 shrink-0">
            {lead.sla_breached && (
              <Clock className="h-3 w-3 text-destructive" />
            )}
            <span className={cn(
              'text-[10px]',
              lead.sla_breached ? 'text-destructive font-medium' :
              isWarning ? 'text-yellow-600 font-medium' :
              'text-muted-foreground',
            )}>
              {timeAgo(lastTime)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground truncate flex-1">{messagePreview(lead)}</p>
          {lead.whatsapp_instance_name && (
            <span className="text-[9px] text-muted-foreground/60 bg-muted px-1 py-0.5 rounded shrink-0">
              ...{lead.whatsapp_instance_name.slice(-4)}
            </span>
          )}
        </div>
      </div>

      {(lead.unread_count ?? 0) > 0 && (
        <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
          {lead.unread_count}
        </span>
      )}
    </button>
  )
}

export { ConversationItem }
