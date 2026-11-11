import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { useInboxStore } from '@/stores/inbox.store'
import { getConversationList } from '@/services/messages.service'
import { useBusinessRules } from '@/hooks/use-business-rules'
import { isResponseOverdue, responseSlaMs } from '@/lib/response-sla'

/** Reavalia o atraso de resposta mesmo sem refetch (o React Query mantem a mesma referencia se nada mudou). */
const CLOCK_TICK_MS = 30_000

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

  const { data: rules } = useBusinessRules()
  const slaMs = responseSlaMs(rules?.sla_hours)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Destaque vermelho: derivado da ultima mensagem, nao de leads.sla_breached
  // (flag do cron check-sla, que ficava presa em true apos a resposta).
  const overdueIds = useMemo(() => {
    const ids = new Set<string>()
    for (const l of query.data ?? []) {
      if (isResponseOverdue(l, slaMs, now)) ids.add(l.id)
    }
    return ids
  }, [query.data, slaMs, now])

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

    // Ordenar por urgencia: resposta atrasada primeiro, depois por ultima mensagem
    result.sort((a, b) => {
      const aOverdue = overdueIds.has(a.id)
      const bOverdue = overdueIds.has(b.id)
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      const aTime = a.last_message?.created_at ?? a.updated_at
      const bTime = b.last_message?.created_at ?? b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    return result
  }, [query.data, filters, profileId, overdueIds])

  useEffect(() => {
    const total = query.data?.reduce((acc, l) => acc + (l.unread_count ?? 0), 0) ?? 0
    setUnreadCount(total)
  }, [query.data, setUnreadCount])

  return { ...query, data: filtered, overdueIds }
}
