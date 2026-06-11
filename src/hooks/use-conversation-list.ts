import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { useInboxStore } from '@/stores/inbox.store'
import { getConversationList } from '@/services/messages.service'

export const useConversationList = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const roles = useAuthStore((s) => s.roles)
  const filters = useInboxStore((s) => s.filters)
  const setUnreadCount = useInboxStore((s) => s.setUnreadCount)

  const isSeller = roles.length > 0 && !roles.some(r => ['admin', 'manager', 'super_admin'].includes(r))

  const query = useQuery({
    queryKey: ['conversations', companyId],
    queryFn: () => getConversationList(companyId!),
    enabled: !!companyId,
    refetchInterval: 15000,
  })

  const filtered = useMemo(() => {
    if (!query.data) return []
    let result = [...query.data]

    // Fase A / R1: Descartar leads sem mensagem do inbox (leads de import/teste).
    // Nao remove do banco nem do pipeline, so da lista do inbox.
    result = result.filter((l) => l.last_message !== null)

    // Vendedor so ve suas proprias conversas (filtro obrigatorio)
    if (isSeller && profileId) {
      result = result.filter((l) => l.assigned_to === profileId)
    }

    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.company_name?.toLowerCase().includes(q)
      )
    }

    if (filters.status !== 'all') {
      result = result.filter((l) => l.conversation_status === filters.status)
    }

    if (!isSeller && filters.assignedTo === 'mine') {
      result = result.filter((l) => l.assigned_to === profileId)
    } else if (!isSeller && filters.assignedTo !== 'all') {
      result = result.filter((l) => l.assigned_to === filters.assignedTo)
    }

    // Ordenar por urgencia: SLA breached primeiro, depois por ultima mensagem
    result.sort((a, b) => {
      if (a.sla_breached && !b.sla_breached) return -1
      if (!a.sla_breached && b.sla_breached) return 1
      const aTime = a.last_message?.created_at ?? a.updated_at
      const bTime = b.last_message?.created_at ?? b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    return result
  }, [query.data, filters, profileId])

  useEffect(() => {
    const total = query.data?.reduce((acc, l) => acc + (l.unread_count ?? 0), 0) ?? 0
    setUnreadCount(total)
  }, [query.data, setUnreadCount])

  return { ...query, data: filtered }
}
