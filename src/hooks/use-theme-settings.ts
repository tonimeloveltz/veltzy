import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { veltzy } from '@/lib/supabase'

export interface ThemeSettings {
  card_style: string
  sidebar_style: string
}

const DEFAULTS: ThemeSettings = { card_style: 'glass', sidebar_style: 'solid' }

export const THEME_SETTINGS_KEY = 'theme_config'

/**
 * Le o estilo visual da empresa (cards/sidebar) salvo em system_settings.
 * Compartilhado entre a sidebar (aplica o estilo) e o customizer (edita).
 */
export function useThemeSettings() {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery<ThemeSettings>({
    queryKey: [THEME_SETTINGS_KEY, companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULTS,
    queryFn: async () => {
      const { data } = await veltzy()
        .from('system_settings')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', THEME_SETTINGS_KEY)
        .maybeSingle()

      const cfg = (data?.value ?? {}) as Partial<ThemeSettings>
      return {
        card_style: cfg.card_style ?? DEFAULTS.card_style,
        sidebar_style: cfg.sidebar_style ?? DEFAULTS.sidebar_style,
      }
    },
  })
}
