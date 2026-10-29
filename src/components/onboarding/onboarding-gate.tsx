import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useOnboardingStatus } from '@/hooks/use-onboarding-status'

interface OnboardingGateProps {
  children: React.ReactNode
}

/** Redireciona o admin de empresa nova, sem numero, para o wizard. Nao bloqueia ninguem mais. */
export const OnboardingGate = ({ children }: OnboardingGateProps) => {
  const { isChecking, needsWizard } = useOnboardingStatus()

  if (isChecking) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  if (needsWizard) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
