import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SUPPORT_EMAIL } from '@/lib/support'

/** Tela das rotas de Eventos quando a empresa nao tem a feature (sem redirecionar). */
export const EventsUpgradeScreen = () => (
  <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
      <CalendarDays className="h-6 w-6" />
    </div>
    <h2 className="text-lg font-semibold">Eventos não está no seu plano</h2>
    <p className="max-w-sm text-sm text-muted-foreground">
      Crie páginas de evento com inscrição que vira negócio na pipeline, confirmação por WhatsApp e check-in.
      Fale com o suporte para liberar.
    </p>
    <Button asChild variant="outline">
      <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Quero liberar Eventos no Veltzy')}`}>
        Falar com o suporte
      </a>
    </Button>
  </div>
)
