import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'
import type { WhatsAppProviderType } from '@/types/database'

interface WhatsAppStatusResult {
  provider: WhatsAppProviderType
  connected: boolean
}

export const useWhatsAppStatus = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['whatsapp-status', companyId],
    queryFn: async (): Promise<WhatsAppStatusResult> => {
      const { data: company } = await supabase
        .from('companies')
        .select('active_whatsapp_provider')
        .eq('id', companyId!)
        .single()

      const provider = (company?.active_whatsapp_provider ?? 'zapi') as WhatsAppProviderType

      if (provider === 'evolution') {
        return { provider: 'evolution', connected: true }
      }

      if (provider === 'cloud_api') {
        return { provider: 'cloud_api', connected: true }
      }

      const { data } = await supabase
        .from('oauth_integrations')
        .select('status')
        .eq('provider', 'zapi')
        .eq('company_id', companyId!)
        .maybeSingle()

      return {
        provider: 'zapi',
        connected: data?.status === 'connected',
      }
    },
    enabled: !!companyId,
    refetchInterval: 1000 * 60 * 2,
  })
}
