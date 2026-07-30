import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { listTemplates, syncTemplatesFromMeta } from '@/services/whatsapp-templates.service'

/** Catalogo local de templates da empresa (veltzy.whatsapp_templates). */
export function useWhatsAppTemplates() {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['whatsapp-templates', companyId],
    queryFn: () => listTemplates(companyId!),
    enabled: !!companyId,
  })
}

/**
 * Sincroniza o catalogo com a Meta (via edge). Invalida a query para a lista
 * refletir os status/qualidade recem-buscados. A UI trata copy de erro no catch.
 */
export function useSyncTemplates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: syncTemplatesFromMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] })
    },
  })
}
