import { useState } from 'react'
import { BadgeCheck, QrCode, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWhatsAppCategories } from '@/hooks/use-whatsapp-categories'
import {
  WHATSAPP_CATEGORIES,
  WHATSAPP_CATEGORY_ORDER,
  type WhatsAppCategoryKey,
} from '@/lib/whatsapp-categories'
import { WhatsAppInstances } from './whatsapp-instances'

const CATEGORY_ICON: Record<WhatsAppCategoryKey, React.ComponentType<{ className?: string }>> = {
  official: BadgeCheck,
  qr_code: QrCode,
}

export const WhatsAppConnectChoice = () => {
  const { data: categories, isLoading } = useWhatsAppCategories()
  const [selected, setSelected] = useState<WhatsAppCategoryKey | null>(null)

  if (isLoading || !categories) {
    return <Skeleton className="h-40 w-full rounded-lg" />
  }

  // Fluxo de QR Code selecionado: reusa o componente existente.
  if (selected === 'qr_code') {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setSelected(null)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Button>
        <WhatsAppInstances />
      </div>
    )
  }

  const visible = WHATSAPP_CATEGORY_ORDER.filter((key) => categories[key])

  if (visible.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum metodo de conexao disponivel.</p>
          <p className="text-xs text-muted-foreground mt-1">Fale com o suporte.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visible.map((key) => {
        const meta = WHATSAPP_CATEGORIES[key]
        const Icon = CATEGORY_ICON[key]
        return (
          <Card key={key} className={meta.available ? '' : 'opacity-70'}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <CardDescription>{meta.description}</CardDescription>
                  </div>
                </div>
                {!meta.available && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    Em configuracao
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                variant={meta.available ? 'default' : 'outline'}
                disabled={!meta.available}
                onClick={() => meta.available && setSelected(key)}
              >
                {meta.available ? 'Conectar' : 'Em breve'}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
