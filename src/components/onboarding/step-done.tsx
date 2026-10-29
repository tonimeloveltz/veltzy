import { ArrowRight, Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useWhatsAppNumbers } from '@/hooks/use-whatsapp-numbers'
import { useInvites } from '@/hooks/use-team'
import { StepHeading } from './step-heading'
import { StepFooter } from './step-footer'

interface StepDoneProps {
  imported: boolean
  onFinish: (to: '/' | '/inbox') => void
  onBack: () => void
  disabled: boolean
}

interface SummaryRowProps {
  done: boolean
  label: string
  detail: string
}

const SummaryRow = ({ done, label, detail }: SummaryRowProps) => (
  <div className="flex flex-wrap items-center gap-3.5 border-b py-3.5 last:border-b-0">
    <span
      className={cn(
        'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full',
        done ? 'bg-primary text-primary-foreground' : 'border-[1.5px] border-border text-muted-foreground',
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.8} /> : <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />}
    </span>
    <span className="min-w-[180px] flex-1 font-bold">{label}</span>
    <span className="text-sm text-muted-foreground">{detail}</span>
  </div>
)

export const StepDone = ({ imported, onFinish, onBack, disabled }: StepDoneProps) => {
  const { data: numbers } = useWhatsAppNumbers()
  const { data: invites } = useInvites()
  const connected = numbers?.find((n) => n.status === 'connected')
  const pendingCount = (invites ?? []).filter((i) => i.status === 'pending').length

  return (
    <>
      <StepHeading
        eyebrow="Passo 5 de 5"
        title="Tudo pronto. Os leads do WhatsApp já chegam no Veltzy."
        description="Cada mensagem nova vira um lead na primeira etapa do Pipeline Principal e é distribuída para a equipe. Ligar a IA SDR, cadastrar produtos e ajustar as regras de distribuição você faz quando quiser, pelos menus Admin e Gestão."
      />

      <section className="mt-8 rounded-xl border bg-card px-6 py-2">
        <SummaryRow
          done={!!connected}
          label="WhatsApp conectado"
          detail={connected?.displayNumber ?? (connected ? connected.providerLabel : 'Nenhum número conectado')}
        />
        <SummaryRow
          done={pendingCount > 0}
          label="Equipe"
          detail={
            pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? 'convite enviado' : 'convites enviados'}`
              : 'Pulada. Dá para convidar depois em Gestão.'
          }
        />
        <SummaryRow
          done={imported}
          label="Planilha"
          detail={imported ? 'Confira o resultado em Contatos.' : 'Pulada. Dá para importar depois em Contatos.'}
        />
      </section>

      <StepFooter onBack={onBack} disabled={disabled}>
        <Button variant="outline" size="lg" onClick={() => onFinish('/')} disabled={disabled}>
          Ir para o painel
        </Button>
        <Button size="lg" onClick={() => onFinish('/inbox')} disabled={disabled}>
          Abrir o Inbox
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </StepFooter>
    </>
  )
}
