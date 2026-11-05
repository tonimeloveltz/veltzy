import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const STEP_LABELS = ['Destinatários', 'Mensagem', 'Configurações', 'Revisão']

// Stepper visual: círculos numerados ligados por linha; etapa atual em destaque,
// concluídas com check, futuras esmaecidas.
export function WizardStepper({ step }: { step: number }) {
  return (
    <div className="flex items-center">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium',
                  current && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary bg-primary/10 text-primary',
                  !current && !done && 'border-input text-muted-foreground',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </div>
              <span className={cn('text-[10px]', current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
            {n < STEP_LABELS.length && (
              <div className={cn('mx-1 h-0.5 flex-1', n < step ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
