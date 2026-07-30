import { useQuery } from '@tanstack/react-query'
import { veltzy as db } from '@/lib/supabase'

/**
 * Janela de atendimento de 24h (Cloud API). ABERTA sse existe mensagem RECEBIDA
 * do contato nas ultimas 24h:
 *   is_history = false  -> exclui o dump importado (created_at = data de importacao)
 *   sender_type = 'lead' -> recebida do contato (echo 'human' do dono NAO conta)
 *   created_at > now()-24h
 * Fora da janela, so template aprovado pode ser enviado (regra da Meta).
 */
export function useConversationWindow(leadId: string) {
  return useQuery({
    queryKey: ['conversation-window', leadId],
    queryFn: async (): Promise<boolean> => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await db()
        .from('messages')
        .select('id')
        .eq('lead_id', leadId)
        .eq('is_history', false)
        .eq('sender_type', 'lead')
        .gt('created_at', since)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
    enabled: !!leadId,
    // A janela expira com o tempo; revalida ao focar e periodicamente.
    staleTime: 60_000,
  })
}
