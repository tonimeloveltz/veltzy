import { useState } from 'react'
import { MessageSquareMore } from 'lucide-react'
import { useFirstInboundLead } from '@/hooks/use-first-inbound-lead'

interface WhatsappTestPanelProps {
  displayNumber: string | null
}

/** Teste de ponta a ponta: prova que a mensagem chega ao Veltzy, nao so que o numero esta connected. */
export const WhatsappTestPanel = ({ displayNumber }: WhatsappTestPanelProps) => {
  // Fixado quando o painel monta, ou seja, quando o numero conectou.
  const [since] = useState(() => new Date().toISOString())
  const { data: lead } = useFirstInboundLead(since, true)
  const target = displayNumber ?? 'o número que você acabou de conectar'

  return (
    <section className="mt-5 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Teste com uma mensagem de verdade</h2>
        <span className="text-xs font-semibold text-muted-foreground">Opcional</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        De outro celular, mande um "oi" para <strong className="text-foreground">{target}</strong>. Quando a mensagem
        chegar ao Veltzy, o lead aparece aqui embaixo.
      </p>

      {lead ? (
        <div role="status">
          <div className="mt-5 flex items-start gap-3.5 rounded-xl border bg-muted/40 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground font-bold text-background">
              {(lead.name ?? lead.phone).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{lead.name ?? 'Sem nome'}</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Novo lead</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{lead.phone}</div>
              <div className="mt-2 text-[13px] text-muted-foreground">Já está no Inbox e no Pipeline.</div>
            </div>
          </div>
          <p className="mt-3.5 text-sm font-semibold text-primary">
            Funcionou. É assim que cada novo contato vai chegar para a sua equipe.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed px-5 py-7 text-center">
          <MessageSquareMore className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <div className="text-[15px] font-bold">Esperando a primeira mensagem...</div>
          <div className="text-[13px] text-muted-foreground">Conferindo a cada 3 segundos.</div>
        </div>
      )}
    </section>
  )
}
