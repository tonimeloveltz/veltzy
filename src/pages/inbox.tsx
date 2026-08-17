import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ConversationList } from '@/components/inbox/conversation-list'
import { ChatWindow } from '@/components/inbox/chat-window'
import { ContactPanel } from '@/components/inbox/contact-panel'
import { EmptyInbox } from '@/components/inbox/empty-inbox'
import { useConversationList } from '@/hooks/use-conversation-list'
import { useIsPanelInline } from '@/hooks/use-panel-inline'
import { useInboxStore } from '@/stores/inbox.store'
import { useAuthStore } from '@/stores/auth.store'
import { getLeadById } from '@/services/leads.service'
import type { LeadWithLastMessage } from '@/types/database'

const InboxPage = () => {
  const { leadId } = useParams<{ leadId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { contactPanelOpen, setContactPanelOpen } = useInboxStore()
  const panelIsInline = useIsPanelInline()
  const selectedLeadId = leadId ?? null
  const { data: conversations } = useConversationList()
  const companyId = useAuthStore((s) => s.company?.id)

  // Compatibilidade com /inbox?lead=<id>: redireciona para a rota canonica.
  // replace: true evita que o voltar quique entre as duas URLs.
  useEffect(() => {
    const leadParam = searchParams.get('lead')
    if (leadParam) {
      navigate(`/inbox/${leadParam}`, { replace: true })
    }
  }, [searchParams, navigate])

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
  const panelOpen = contactPanelOpen ?? panelIsInline
  const showPanel = panelOpen && !!selectedLead

  return (
    <div className="flex h-full relative">
      {/* Master-detail abaixo de lg: uma coluna por vez */}
      <div
        className={cn(
          'w-full shrink-0 lg:w-[340px] lg:min-w-[300px]',
          selectedLeadId && 'hidden lg:block',
        )}
      >
        <ConversationList />
      </div>
      <div
        className={cn(
          'flex-1 min-w-0',
          !selectedLeadId && 'hidden lg:block',
        )}
      >
        {selectedLead ? (
          <ChatWindow lead={selectedLead} />
        ) : (
          <EmptyInbox />
        )}
      </div>

      {/* Contact panel - inline on xl+, overlay below xl. Uma unica instancia. */}
      {showPanel && (
        <>
          {!panelIsInline && (
            <div
              className="absolute inset-0 z-30 bg-black/20"
              onClick={() => setContactPanelOpen(false)}
            />
          )}
          <div
            className={cn(
              'z-40',
              panelIsInline
                ? 'h-full shrink-0 relative w-[360px]'
                : 'absolute right-0 top-0 bottom-0 w-[340px] max-w-[85vw]',
            )}
          >
            <ContactPanel lead={selectedLead} />
          </div>
        </>
      )}
    </div>
  )
}

export default InboxPage
