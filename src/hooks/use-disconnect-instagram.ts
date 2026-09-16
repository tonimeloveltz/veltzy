import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { disconnectInstagram } from '@/services/instagram.service'
import { INSTAGRAM_CONNECTION_QUERY_KEY } from '@/hooks/use-instagram-connection'

export const useDisconnectInstagram = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: disconnectInstagram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTAGRAM_CONNECTION_QUERY_KEY] })
      toast.success('Instagram desconectado')
    },
    onError: () => toast.error('Não foi possível desconectar o Instagram. Tente de novo.'),
  })
}
