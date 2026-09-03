import { useEffect, useState } from 'react'
import { BadgeCheck, QrCode, Smartphone } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useWhatsAppCategories } from '@/hooks/use-whatsapp-categories'
import { WhatsAppConnectDialog } from './whatsapp-connect-dialog'
import { WahaConnectDialog } from './waha-connect-dialog'
import { OfficialManageDialog } from './official-manage-dialog'

export type ConnectChoice = 'official' | 'evolution' | 'waha'

interface ConnectNumberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando setado, pula o seletor e abre direto o fluxo desse provider
   *  (usado pelo botao "Conectar" das linhas vazias por-provider). */
  initialProvider?: ConnectChoice
}

// Cada provider com rotulo/badge distinto (WAHA e categoria propria; sem
// "Conexao via QR Code (alternativa)" ambiguo).
const CHOICES: { key: ConnectChoice; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'official', label: 'WhatsApp API Oficial', description: 'Numero oficial verificado da empresa', icon: BadgeCheck },
  { key: 'evolution', label: 'Evolution', description: 'Conecte um numero escaneando o QR', icon: QrCode },
  { key: 'waha', label: 'WAHA', description: 'Conecte um numero escaneando o QR', icon: Smartphone },
]

/** Seletor unico "Conectar numero": escolhe o metodo e abre o fluxo certo.
 *  Cloud API -> embedded signup; Evolution -> QR dialog; WAHA -> QR dialog (proxy provider=waha). */
export const ConnectNumberDialog = ({ open, onOpenChange, initialProvider }: ConnectNumberDialogProps) => {
  const { data: categories } = useWhatsAppCategories()
  const [flow, setFlow] = useState<ConnectChoice | null>(null)

  // Gating por empresa: Oficial->official, Evolution->qr_code, WAHA->waha (categoria propria).
  const isVisible = (key: ConnectChoice) =>
    key === 'official' ? !!categories?.official
      : key === 'evolution' ? !!categories?.qr_code
        : !!categories?.waha
  const visibleChoices = CHOICES.filter((c) => isVisible(c.key))

  // Atalho: abrir direto no fluxo do provider (linha vazia por-provider).
  useEffect(() => {
    if (open && initialProvider) {
      onOpenChange(false)
      setFlow(initialProvider)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProvider])

  const pick = (key: ConnectChoice) => {
    onOpenChange(false) // fecha o seletor; o fluxo abre em seguida
    setFlow(key)
  }

  return (
    <>
      <Dialog open={open && !initialProvider} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar numero</DialogTitle>
            <DialogDescription>Escolha como conectar o numero de WhatsApp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {visibleChoices.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum metodo de conexao disponivel. Fale com o suporte.
              </p>
            ) : (
              visibleChoices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pick(c.key)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <c.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fluxos especificos (abrem apos a escolha) */}
      <OfficialManageDialog open={flow === 'official'} onOpenChange={(o) => !o && setFlow(null)} />
      <WhatsAppConnectDialog
        open={flow === 'evolution'}
        onOpenChange={(o) => !o && setFlow(null)}
        mode="create"
      />
      <WahaConnectDialog open={flow === 'waha'} onOpenChange={(o) => !o && setFlow(null)} />
    </>
  )
}
