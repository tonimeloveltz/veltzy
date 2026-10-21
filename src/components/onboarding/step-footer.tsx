import { Button } from '@/components/ui/button'

interface StepFooterProps {
  onBack?: () => void
  disabled?: boolean
  children: React.ReactNode
}

/** Rodape das etapas: "Voltar" a esquerda, acoes da etapa a direita. */
export const StepFooter = ({ onBack, disabled, children }: StepFooterProps) => (
  <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
    {onBack ? (
      <Button variant="outline" size="lg" onClick={onBack} disabled={disabled}>
        Voltar
      </Button>
    ) : (
      <span aria-hidden="true" />
    )}
    <div className="flex flex-wrap gap-2.5">{children}</div>
  </div>
)
