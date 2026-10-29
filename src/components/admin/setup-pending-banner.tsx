import { useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoles } from '@/hooks/use-roles'
import { useWhatsAppNumbers } from '@/hooks/use-whatsapp-numbers'
import { hasConnectedNumber } from '@/lib/onboarding'
import { ConnectNumberDialog } from './connect-number-dialog'

/** Aviso no topo do Admin enquanto a empresa nao tem nenhum numero conectado (nova que pulou ou antiga). */
export const SetupPendingBanner = () => {
  const { isAdmin } = useRoles()
  const { data, isLoading, isError } = useWhatsAppNumbers()
  const [connectOpen, setConnectOpen] = useState(false)

  if (!isAdmin || isLoading || isError || !data || hasConnectedNumber(data)) return null

  return (
    <>
      <section
        role="status"
        className="flex flex-wrap items-center gap-3.5 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3.5"
      >
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-[240px] flex-1 leading-snug">
          <p className="text-sm font-bold">Termine de configurar o Veltzy</p>
          <p className="text-xs text-muted-foreground">
            Nenhum número de WhatsApp conectado. Sem ele, nenhum lead entra e nenhuma mensagem sai.
          </p>
        </div>
        <Button size="sm" onClick={() => setConnectOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Conectar agora
        </Button>
      </section>
      <ConnectNumberDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </>
  )
}
