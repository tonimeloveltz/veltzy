import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ConversationList } from '@/components/inbox/conversation-list'
import { ChatWindow } from '@/components/inbox/chat-window'
import { ContactPanel } from '@/components/inbox/contact-panel'
import { EmptyInbox } from '@/components/inbox/empty-inbox'
import { useConversationList } from '@/hooks/use-conversation-list'
import { useInboxStore } from '@/stores/inbox.store'
import { useAuthStore } from '@/stores/auth.store'
import { getLeadById } from '@/services/leads.service'
import type { LeadWithLastMessage } from '@/types/database'

const InboxPage = () => {
  const [searchParams] = useSearchParams()
  const { selectedLeadId, setSelectedLeadId, contactPanelOpen, setContactPanelOpen } = useInboxStore()
  const { data: conversations } = useConversationList()
  const companyId = useAuthStore((s) => s.company?.id)

  useEffect(() => {
    const leadParam = searchParams.get('lead')
    if (leadParam) {
      setSelectedLeadId(leadParam)
    }
  }, [searchParams, setSelectedLeadId])

  const conversationLead = conversations?.find((l) => l.id === selectedLeadId) ?? null

  // Busca o lead diretamente quando nao esta na lista de conversas (ex: lead manual sem mensagens)
  const { data: directLead } = useQuery({
    queryKey: ['lead-for-inbox', selectedLeadId],
    queryFn: async (): Promise<LeadWithLastMessage> => {
      const lead = await getLeadById(companyId!, selectedLeadId!)
      return {
        ...lead,
        last_message: null,
        unread_count: 0,
      }
    },
    enabled: !!selectedLeadId && !!companyId && !conversationLead,
  })

  const selectedLead = conversationLead ?? directLead ?? null
  const showPanel = contactPanelOpen && !!selectedLead

  return (
    <div className="flex h-full relative">
      <div className="w-[340px] min-w-[300px] shrink-0">
        <ConversationList />
      </div>
      <div className="flex-1 min-w-0">
        {selectedLead ? (
          <ChatWindow lead={selectedLead} />
        ) : (
          <EmptyInbox />
        )}
      </div>

      {/* Contact panel - inline on xl+, overlay below xl */}
      {showPanel && (
        <>
          {/* Overlay backdrop for < xl */}
          <div
            className="absolute inset-0 z-30 bg-black/20 xl:hidden"
            onClick={() => setContactPanelOpen(false)}
          />
          <div
            className={cn(
              'h-full shrink-0 z-40',
              // Desktop: inline third column
              'hidden xl:block xl:relative xl:w-[360px]',
            )}
          >
            <ContactPanel lead={selectedLead} />
          </div>
          {/* Mobile/tablet: overlay from right */}
          <div className="absolute right-0 top-0 bottom-0 z-40 w-[340px] max-w-[85vw] xl:hidden">
            <ContactPanel lead={selectedLead} />
          </div>
        </>
      )}
    </div>
  )
}

export default InboxPage
