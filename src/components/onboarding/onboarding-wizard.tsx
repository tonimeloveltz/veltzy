import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { useMarkOnboarding } from '@/hooks/use-mark-onboarding'
import { OnboardingHeader } from './onboarding-header'
import { StepWelcome } from './step-welcome'
import { StepWhatsapp } from './step-whatsapp'
import { StepTeam } from './step-team'
import { StepImport } from './step-import'
import { StepDone } from './step-done'

type Step = 0 | 1 | 2 | 3 | 4

export const OnboardingWizard = () => {
  const navigate = useNavigate()
  const profileName = useAuthStore((s) => s.profile?.name ?? '')
  const companyName = useAuthStore((s) => s.company?.name ?? 'sua empresa')
  const mark = useMarkOnboarding()
  const [step, setStep] = useState<Step>(0)
  // Estado de UI: so troca o rotulo do rodape da planilha e o resumo final.
  const [imported, setImported] = useState(false)

  const next = () => setStep((s) => Math.min(s + 1, 4) as Step)
  const back = () => setStep((s) => Math.max(s - 1, 0) as Step)

  // "Fazer depois" encerra o onboarding: grava skipped_at e nunca mais redireciona.
  const skip = () => mark.mutate('skipped_at', { onSettled: () => navigate('/', { replace: true }) })
  const finish = (to: '/' | '/inbox') =>
    mark.mutate('completed_at', { onSettled: () => navigate(to, { replace: true }) })

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <OnboardingHeader
        step={step}
        onStepClick={(s) => setStep(s as Step)}
        onSkip={step < 4 ? skip : undefined}
        disabled={mark.isPending}
      />
      <main className="mx-auto w-full max-w-[760px] px-4 pb-12 pt-10 sm:px-6 sm:pt-14">
        {step === 0 && <StepWelcome userName={profileName} companyName={companyName} onStart={next} />}
        {step === 1 && <StepWhatsapp onContinue={next} onBack={back} onSkip={skip} disabled={mark.isPending} />}
        {step === 2 && <StepTeam onNext={next} onBack={back} />}
        {step === 3 && (
          <StepImport imported={imported} onImported={() => setImported(true)} onNext={next} onBack={back} />
        )}
        {step === 4 && <StepDone imported={imported} onFinish={finish} onBack={back} disabled={mark.isPending} />}
      </main>
    </div>
  )
}
