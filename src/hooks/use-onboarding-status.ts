import { useAuthStore } from '@/stores/auth.store'
import { useWhatsAppNumbers } from '@/hooks/use-whatsapp-numbers'
import { isOnboardingCandidate } from '@/lib/onboarding'

/** Decide se o gate redireciona para /onboarding. Fail-open em loading/erro. */
export const useOnboardingStatus = () => {
  const roles = useAuthStore((s) => s.roles)
  const company = useAuthStore((s) => s.company)
  const candidate = isOnboardingCandidate(roles, company)

  // So consulta os numeros de quem e candidato, para nao pesar o login de todo mundo.
  const { data, isLoading, isError } = useWhatsAppNumbers({ enabled: candidate })

  return {
    isChecking: candidate && isLoading,
    needsWizard: candidate && !isError && data !== undefined && data.length === 0,
  }
}
