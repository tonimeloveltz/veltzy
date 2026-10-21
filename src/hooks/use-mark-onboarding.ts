import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { markOnboarding, mergeOnboardingMark, type OnboardingMark } from '@/services/onboarding.service'

export const useMarkOnboarding = () => {
  const company = useAuthStore((s) => s.company)
  const setCompany = useAuthStore((s) => s.setCompany)

  return useMutation({
    mutationFn: (mark: OnboardingMark) => markOnboarding(company!.id, mark),
    onSuccess: (metadata) => {
      if (company) setCompany({ ...company, metadata })
    },
    onError: (err: Error, mark) => {
      // Sem a flag local o gate redirecionaria de volta ao wizard (loop).
      // Vale so para a sessao; o wizard pode reaparecer no proximo login.
      if (company) setCompany({ ...company, metadata: mergeOnboardingMark(company.metadata, mark) })
      toast.error(err.message)
    },
  })
}
