import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as googleCalendarService from '@/services/google-calendar.service'

export const GOOGLE_CALENDAR_CONNECTION_KEY = 'google-calendar-connection'

/**
 * Conexao Google do vendedor logado. Responde null quando ele nunca conectou,
 * e e isso que o dialogo de agendamento usa para avisar antes do preenchimento.
 */
export const useGoogleCalendarConnection = () => {
  const profileId = useAuthStore((s) => s.profile?.id)

  return useQuery({
    queryKey: [GOOGLE_CALENDAR_CONNECTION_KEY, profileId],
    queryFn: () => googleCalendarService.getConnection(profileId!),
    enabled: !!profileId,
    staleTime: 1000 * 60,
  })
}

export const useConnectGoogleCalendar = () => {
  return useMutation({
    mutationFn: () => googleCalendarService.startAuthorization(),
    onSuccess: (url) => {
      // Sai da SPA de proposito: o consentimento acontece no dominio do Google
      // e volta em /oauth/google/callback.
      window.location.href = url
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao conectar Google Agenda')
    },
  })
}

export const useDisconnectGoogleCalendar = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => googleCalendarService.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GOOGLE_CALENDAR_CONNECTION_KEY] })
      toast.success('Google Agenda desconectado')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao desconectar Google Agenda')
    },
  })
}
