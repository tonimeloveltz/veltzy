import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StepHeading } from './step-heading'

interface StepWelcomeProps {
  userName: string
  companyName: string
  onStart: () => void
}

const READY = [
  'Funil "Pipeline Principal" com 6 etapas',
  'Origens WhatsApp, Instagram e Manual',
  'Regras de negócio padrão (IA SDR desligada)',
  'Seu acesso de administrador',
]

const NEXT = [
  { label: 'Conectar o WhatsApp', essential: true },
  { label: 'Convidar a equipe', essential: false },
  { label: 'Importar sua planilha de contatos', essential: false },
]

export const StepWelcome = ({ userName, companyName, onStart }: StepWelcomeProps) => {
  const firstName = userName.trim().split(/\s+/)[0]

  return (
    <>
      <StepHeading
        eyebrow="Bem-vindo ao Veltzy"
        title={`Olá${firstName ? `, ${firstName}` : ''}. Vamos deixar a ${companyName} pronta para vender.`}
        description="O funil e as regras básicas já estão montados. Falta só uma coisa para os leads começarem a chegar: conectar um número de WhatsApp."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border bg-card p-6">
          <h2 className="mb-3.5 text-[15px] font-bold">Já está pronto</h2>
          <ul className="flex flex-col gap-3">
            {READY.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-snug">
                <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.2} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="mb-3.5 text-[15px] font-bold">O que vamos fazer agora</h2>
          <ul className="flex flex-col gap-3">
            {NEXT.map((item, i) => (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    'grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-xs font-bold',
                    item.essential ? 'bg-foreground text-background' : 'border-[1.5px] border-border',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.essential ? (
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Essencial</span>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">Opcional</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Leva poucos minutos. Dá para parar e voltar depois pelo Admin.</p>
        <Button size="lg" onClick={onStart} className="font-bold">
          Começar
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </>
  )
}
