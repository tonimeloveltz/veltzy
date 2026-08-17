import { useEffect, useState } from 'react'
import { BadgeCheck, QrCode, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useWhatsAppCategories } from '@/hooks/use-whatsapp-categories'
import { useCloudApiConnection } from '@/hooks/use-cloud-api-connection'
import {
  WHATSAPP_CATEGORIES,
  WHATSAPP_CATEGORY_ORDER,
  type WhatsAppCategoryKey,
} from '@/lib/whatsapp-categories'
import { WhatsAppInstances } from './whatsapp-instances'
import { WhatsAppEmbeddedSignup } from './whatsapp-embedded-signup'
import { WhatsAppTemplatesManager } from './whatsapp-templates-manager'

const CATEGORY_ICON: Record<WhatsAppCategoryKey, React.ComponentType<{ className?: string }>> = {
  official: BadgeCheck,
  qr_code: QrCode,
}

interface WhatsAppConnectChoiceProps {
  // Notifica o container quando o canal esta em modo "gerenciar" (uma opcao aberta),
  // pra ele esconder os outros cards de canal e nao vazarem embaixo da gestao.
  onManagingChange?: (managing: boolean) => void
}

export const WhatsAppConnectChoice = ({ onManagingChange }: WhatsAppConnectChoiceProps = {}) => {
  const { data: categories, isLoading } = useWhatsAppCategories()
  const { connected: officialConnected } = useCloudApiConnection()
  const [selected, setSelected] = useState<WhatsAppCategoryKey | null>(null)

  useEffect(() => {
    onManagingChange?.(selected !== null)
  }, [selected, onManagingChange])

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

  // Fluxo oficial selecionado: cadastro incorporado. Com o oficial ja conectado,
  // separa em sub-abas Numeros / Templates; sem conexao, so o cadastro incorporado.
  if (selected === 'official') {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setSelected(null)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Button>
        {officialConnected ? (
          <Tabs defaultValue="numeros">
            <TabsList>
              <TabsTrigger value="numeros">Números</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>
            <TabsContent value="numeros" className="mt-3">
              <WhatsAppEmbeddedSignup />
            </TabsContent>
            <TabsContent value="templates" className="mt-3">
              <WhatsAppTemplatesManager />
            </TabsContent>
          </Tabs>
        ) : (
          <WhatsAppEmbeddedSignup />
        )}
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
              {key === 'official' && officialConnected ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Conectado
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setSelected(key)}>
                    Gerenciar
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant={meta.available ? 'default' : 'outline'}
                  disabled={!meta.available}
                  onClick={() => meta.available && setSelected(key)}
                >
                  {meta.available ? 'Conectar' : 'Em breve'}
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
