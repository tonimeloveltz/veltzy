import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search, Loader2, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConversationItem } from '@/components/inbox/conversation-item'
import { useConversationList } from '@/hooks/use-conversation-list'
import { useInboxStore } from '@/stores/inbox.store'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useEvolutionInstances } from '@/hooks/use-evolution-instances'
import { useFailedMessages } from '@/hooks/use-failed-messages'
import { useRoles } from '@/hooks/use-roles'

const ConversationList = () => {
  const { data: conversations, isLoading } = useConversationList()
  const { filters, setFilters } = useInboxStore()
  const { leadId: selectedLeadId } = useParams<{ leadId: string }>()
  const navigate = useNavigate()
  const { data: whatsappStatus } = useWhatsAppStatus()
  const { data: instances } = useEvolutionInstances()
  const { data: failedCount } = useFailedMessages()
  const { isAdmin, isManager } = useRoles()
  const isEvolution = whatsappStatus?.provider === 'evolution'
  const [instanceFilter, setInstanceFilter] = useState('all')

  const filteredConversations = conversations?.filter((c) => {
    if (isEvolution && instanceFilter !== 'all' && (isAdmin || isManager)) {
      return c.whatsapp_instance_name === instanceFilter
    }
    return true
  })

  return (
    <div className="flex h-full flex-col border-r bg-muted/20">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="h-9 pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters({ status: v as typeof filters.status })}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unread">Nao lidas</SelectItem>
              <SelectItem value="replied">Respondidas</SelectItem>
              <SelectItem value="waiting_client">Aguardando cliente</SelectItem>
              <SelectItem value="resolved">Resolvidas</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.assignedTo}
            onValueChange={(v) => setFilters({ assignedTo: v })}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mine">Meus leads</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isEvolution && (isAdmin || isManager) && (
          <Select value={instanceFilter} onValueChange={setInstanceFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Todos os numeros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os numeros</SelectItem>
              {instances?.map((inst) => (
                <SelectItem key={inst.instance_name} value={inst.instance_name}>
                  {inst.phone_number ? `...${inst.phone_number.slice(-4)}` : inst.instance_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {(isAdmin || isManager) && !!failedCount && failedCount > 0 && (
        <div className="flex items-center gap-2 mx-3 mb-2 px-2 py-1.5 bg-destructive/10 text-destructive text-xs rounded">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{failedCount} msg(s) nao entregue(s) nos ultimos 7 dias</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && filteredConversations?.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        )}

        {filteredConversations?.map((lead) => (
          <ConversationItem
            key={lead.id}
            lead={lead}
            isSelected={lead.id === selectedLeadId}
            onClick={() => navigate(`/inbox/${lead.id}`, { state: { fromList: true } })}
          />
        ))}
      </div>
    </div>
  )
}

export { ConversationList }
