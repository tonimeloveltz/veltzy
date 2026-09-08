import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCloudApiConnection } from '@/hooks/use-cloud-api-connection'
import { WhatsAppEmbeddedSignup } from './whatsapp-embedded-signup'
import { WhatsAppTemplatesManager } from './whatsapp-templates-manager'

interface OfficialManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Gerencia o WhatsApp API Oficial (Cloud API): conectar numero + templates.
 *  Reusado pelo seletor "Conectar numero" (Oficial) e pela acao "Gerenciar" do card. */
export const OfficialManageDialog = ({ open, onOpenChange }: OfficialManageDialogProps) => {
  const { connected } = useCloudApiConnection()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp API Oficial</DialogTitle>
        </DialogHeader>
        {connected ? (
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
      </DialogContent>
    </Dialog>
  )
}
