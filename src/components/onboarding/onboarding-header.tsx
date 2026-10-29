import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const ONBOARDING_STEPS = ['Boas-vindas', 'WhatsApp', 'Equipe', 'Planilha', 'Pronto'] as const

interface OnboardingHeaderProps {
  step: number
  /** Volta para uma etapa ja feita (clique na pilula do topo). */
  onStepClick: (step: number) => void
  /** Ausente na ultima etapa: ali nao ha o que adiar. */
  onSkip?: () => void
  disabled: boolean
}

export const OnboardingHeader = ({ step, onStepClick, onSkip, disabled }: OnboardingHeaderProps) => (
  <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-8">
    <div className="flex items-center gap-2.5 text-lg font-extrabold">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-sm text-background">
        V
      </span>
      Veltzy
    </div>

    <ol aria-label="Etapas" className="order-last flex w-full flex-wrap gap-1 sm:order-none sm:w-auto">
      {ONBOARDING_STEPS.map((label, i) => {
        const current = i === step
        const done = i < step
        const Wrapper = done ? 'button' : 'div'
        return (
          <li key={label} aria-current={current ? 'step' : undefined}>
            <Wrapper
              {...(done ? { type: 'button' as const, onClick: () => onStepClick(i), disabled, 'aria-label': `Voltar para ${label}` } : {})}
              className={cn(
                'flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[13px] font-semibold text-muted-foreground',
                current && 'bg-primary/10 text-foreground',
                done && 'transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full border-[1.5px] border-border text-xs',
                  current && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary text-primary',
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn(!current && 'sr-only md:not-sr-only')}>{label}</span>
            </Wrapper>
          </li>
        )
      })}
    </ol>

    {onSkip ? (
      <Button variant="ghost" onClick={onSkip} disabled={disabled} className="font-semibold">
        Fazer depois
      </Button>
    ) : (
      <span aria-hidden="true" />
    )}
  </header>
)
