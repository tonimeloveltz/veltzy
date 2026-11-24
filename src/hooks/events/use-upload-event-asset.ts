import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { EventAssetError, uploadEventAsset, type EventAssetKind } from '@/services/event-assets.service'

/** Sobe o arquivo na hora; o caminho entra no formulario e so vale depois do Salvar. */
export const useUploadEventAsset = (eventId: string) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useMutation({
    mutationFn: ({ kind, file }: { kind: EventAssetKind; file: File }) => {
      if (!companyId) throw new Error('Empresa não carregada')
      return uploadEventAsset(companyId, eventId, kind, file)
    },
    onError: (err) => toast.error(err instanceof EventAssetError ? err.message : 'Não foi possível enviar a imagem.'),
  })
}
