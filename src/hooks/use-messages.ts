import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import * as messagesService from '@/services/messages.service'
import type { SendMessagePayload, Message } from '@/types/database'

export const useMessages = (leadId: string | null) => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  const query = useQuery({
    queryKey: ['messages', leadId],
    queryFn: () => messagesService.getMessages(companyId!, leadId!),
    enabled: !!leadId && !!companyId,
    refetchInterval: false,
  })

  useEffect(() => {
    if (!leadId) return

    const channel = supabase
      .channel(`messages:${leadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'veltzy', table: 'messages', filter: `lead_id=eq.${leadId}` },
        (payload) => {
          queryClient.setQueryData<Message[]>(['messages', leadId], (old) => {
            if (!old) return [payload.new as Message]
            const newMsg = payload.new as Message
            const exists = old.some((m) => m.id === newMsg.id)
            if (exists) return old
            // Remove mensagem otimista se a real chegou (mesmo content + sender_type + proximidade temporal)
            const filtered = old.filter((m) => {
              if (!m.id.startsWith('optimistic-')) return true
              return m.content !== newMsg.content || m.sender_type !== newMsg.sender_type
            })
            return [...filtered, newMsg]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'veltzy', table: 'messages', filter: `lead_id=eq.${leadId}` },
        (payload) => {
          queryClient.setQueryData<Message[]>(['messages', leadId], (old) => {
            if (!old) return old ?? []
            const updated = payload.new as Message
            return old.map((m) => m.id === updated.id ? { ...m, ...updated } : m)
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadId, queryClient])

  return query
}

export const useSendMessage = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (payload: SendMessagePayload) =>
      messagesService.routeMessage(companyId!, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['messages', payload.leadId] })

      const previous = queryClient.getQueryData<Message[]>(['messages', payload.leadId])

      const optimisticMessage: Message & { _optimistic?: boolean } = {
        id: `optimistic-${Date.now()}`,
        lead_id: payload.leadId,
        company_id: companyId!,
        content: payload.content,
        sender_type: 'human',
        message_type: payload.messageType ?? 'text',
        file_url: payload.fileUrl ?? null,
        file_name: payload.fileName ?? null,
        file_mime_type: payload.mimeType ?? null,
        file_size: null,
        source: 'manual',
        external_id: null,
        replied_message_id: payload.repliedMessageId ?? null,
        instance_name: null,
        delivery_status: 'pending',
        delivery_error: null,
        is_scheduled: false,
        scheduled_at: null,
        is_read: true,
        created_at: new Date().toISOString(),
        _optimistic: true,
      }

      queryClient.setQueryData<Message[]>(['messages', payload.leadId], (old) =>
        [...(old ?? []), optimisticMessage]
      )

      return { previous, leadId: payload.leadId }
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['messages', context.leadId], context.previous)
      }
      toast.error('Erro ao enviar mensagem')
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export const useWhatsAppConnected = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['whatsapp-connected', companyId],
    queryFn: () => messagesService.isWhatsAppConnected(companyId!),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
}

export const useMarkAsRead = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (leadId: string) => messagesService.markAsRead(companyId!, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
