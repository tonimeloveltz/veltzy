import { useState } from 'react'
import { AlertTriangle, Check, Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConnectNumberDialog } from '@/components/admin/connect-number-dialog'
import { useWhatsAppNumbers } from '@/hooks/use-whatsapp-numbers'
import { useWhatsAppCategories } from '@/hooks/use-whatsapp-categories'
import { useAuthStore } from '@/stores/auth.store'
import { pickQrProvider } from '@/lib/onboarding'
import { StepHeading } from './step-heading'
import { StepFooter } from './step-footer'
import { WhatsappTestPanel } from './whatsapp-test-panel'

interface StepWhatsappProps {
  onContinue: () => void
  onBack: () => void
  onSkip: () => void
  disabled: boolean
}

const EYEBROW = 'Passo 2 de 5 · Essencial'

export const StepWhatsapp = ({ onContinue, onBack, onSkip, disabled }: StepWhatsappProps) => {
  const activeProvider = useAuthStore((s) => s.company?.active_whatsapp_provider)
  // Polling: o dialog da Evolution nao invalida ['whatsapp-numbers'].
  const { data: numbers } = useWhatsAppNumbers({ refetchInterval: 5_000 })
  const { data: categories, isLoading: categoriesLoading } = useWhatsAppCategories()
  const [connectOpen, setConnectOpen] = useState(false)

  const connected = numbers?.find((n) => n.status === 'connected')
  const qrProvider = pickQrProvider(categories, activeProvider)

  if (connected) {
    return (
      <>
        <StepHeading eyebrow={EYEBROW} title="WhatsApp conectado" />
        <div className="flex items-center gap-3.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-[18px] w-[18px]" strokeWidth={2.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold">{connected.displayNumber ?? 'Número conectado'}</div>
            <div className="text-[13px] text-muted-foreground">{connected.providerLabel} · conectado</div>
          </div>
        </div>
        <WhatsappTestPanel displayNumber={connected.displayNumber} />
        <StepFooter onBack={onBack} disabled={disabled}>
          <Button size="lg" onClick={onContinue} disabled={disabled}>Continuar</Button>
        </StepFooter>
      </>
    )
  }

  return (
    <>
      <StepHeading
        eyebrow={EYEBROW}
        title="Conecte o WhatsApp da empresa"
        description="É por ele que os leads entram no Veltzy e que sua equipe responde. Sem um número conectado, o inbox e o pipeline ficam vazios."
      />

      {categoriesLoading ? (
        <div className="mt-8 flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : qrProvider ? (
        <>
          <section className="mt-8 flex flex-col gap-3 rounded-xl border bg-card p-6">
            <QrCode className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
            <h2 className="text-lg font-bold">WhatsApp pelo QR Code</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Use o número que já está no celular. Você escaneia o código pelo app do WhatsApp.
            </p>
            <Button variant="outline" size="lg" className="self-start" onClick={() => setConnectOpen(true)}>
              Gerar QR Code
            </Button>
          </section>
          <div className="mt-6 flex items-center gap-2.5 text-sm text-muted-foreground">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-border" />
            Nenhum número conectado ainda. Esta tela atualiza sozinha quando a conexão terminar.
          </div>
          <ConnectNumberDialog open={connectOpen} onOpenChange={setConnectOpen} initialProvider={qrProvider} />
        </>
      ) : (
        <section className="mt-8 flex flex-wrap items-start gap-4 rounded-xl border border-primary/40 bg-primary/5 px-6 py-7">
          <AlertTriangle className="h-8 w-8 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />
          <div className="min-w-[240px] flex-1">
            <h2 className="text-lg font-bold">Nenhum canal de WhatsApp liberado</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Sua conta ainda não tem a conexão por QR Code habilitada. Fale com o suporte para liberar. Enquanto isso,
              você pode seguir usando o Veltzy com leads manuais.
            </p>
          </div>
        </section>
      )}

      <StepFooter onBack={onBack} disabled={disabled}>
        {!categoriesLoading && !qrProvider && (
          <Button variant="outline" size="lg" onClick={onSkip} disabled={disabled}>Fazer depois</Button>
        )}
        <Button size="lg" disabled>Continuar</Button>
      </StepFooter>
    </>
  )
}
