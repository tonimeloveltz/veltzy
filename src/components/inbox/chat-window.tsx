import { useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { ChatHeader } from '@/components/inbox/chat-header'
import { LeadDealsPanel } from '@/components/inbox/lead-deals-panel'
import { MessageList } from '@/components/inbox/message-list'
import { ChatInput } from '@/components/inbox/chat-input'
import { AdContextCard } from '@/components/inbox/ad-context-card'
import { useMessages, useMarkAsRead } from '@/hooks/use-messages'
import { useTypingIndicator } from '@/hooks/use-typing-indicator'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import type { LeadWithLastMessage } from '@/types/database'

interface ChatWindowProps {
  lead: LeadWithLastMessage
}

const ChatWindow = ({ lead }: ChatWindowProps) => {
  const { data: messages, isLoading } = useMessages(lead.id)
  const markAsRead = useMarkAsRead()
  const { isTyping, sendTyping } = useTypingIndicator(lead.id)
  const { data: waStatus } = useWhatsAppStatus()
  const waDisconnected = waStatus ? !waStatus.connected : false

  useEffect(() => {
    if (lead.conversation_status === 'unread' || (lead.unread_count ?? 0) > 0) {
      markAsRead.mutate(lead.id)
    }
  }, [lead.id, lead.conversation_status, lead.unread_count]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <ChatHeader lead={lead} />
      <LeadDealsPanel leadId={lead.id} leadName={lead.name} />

      {waDisconnected && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            WhatsApp desconectado. As mensagens nao estao sendo recebidas.
          </span>
        </div>
      )}

      {lead.ad_context && <AdContextCard adContext={lead.ad_context} />}

      <MessageList
        messages={messages ?? []}
        isLoading={isLoading}
        isTyping={isTyping}
      />

      <ChatInput leadId={lead.id} onTyping={sendTyping} />
    </div>
  )
}

export { ChatWindow }
