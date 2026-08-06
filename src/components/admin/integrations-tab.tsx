import { useState } from 'react'
import { Calendar, Globe, Mail, Plus, Copy, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PaymentIntegrations } from '@/components/admin/payment-integrations'
import { WhatsAppConnectChoice } from '@/components/admin/whatsapp-connect-choice'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { usePipelines } from '@/hooks/use-pipelines'
import {
  useWebhookIntegrations,
  useCreateWebhookIntegration,
  useRegenerateWebhookToken,
  useToggleWebhookIntegration,
  useDeleteWebhookIntegration,
} from '@/hooks/use-webhook-integrations'
import type { WebhookPreset, WebhookIntegrationWithDetails } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// --- Presets ---

const PRESETS: { value: WebhookPreset; label: string; description: string }[] = [
  { value: 'generic', label: 'Generico', description: 'JSON com campos: phone, name, email, tags, observations' },
  { value: 'meta_lead_ads', label: 'Meta Lead Ads', description: 'Payload achatado via Zapier/n8n/Make (full_name, phone_number, email)' },
  { value: 'google_lead_form', label: 'Google Lead Form', description: 'user_column_data com FULL_NAME, PHONE_NUMBER, EMAIL' },
  { value: 'rd_station', label: 'RD Station', description: 'leads[0] com name, personal_phone, email' },
]

const PRESET_EXAMPLES: Record<WebhookPreset, string> = {
  generic: JSON.stringify({ phone: '11999999999', name: 'Joao Silva', email: 'joao@email.com', tags: ['landing-page'] }, null, 2),
  meta_lead_ads: JSON.stringify({ full_name: 'Joao Silva', phone_number: '+5511999999999', email: 'joao@email.com' }, null, 2),
  google_lead_form: JSON.stringify({ user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Joao Silva' }, { column_id: 'PHONE_NUMBER', string_value: '+5511999999999' }, { column_id: 'EMAIL', string_value: 'joao@email.com' }] }, null, 2),
  rd_station: JSON.stringify({ leads: [{ name: 'Joao Silva', personal_phone: '+5511999999999', email: 'joao@email.com' }] }, null, 2),
}

// --- Shared components ---

const HubManagedCard = ({ title, description, icon: Icon }: { title: string; description: string; icon: React.ComponentType<{ className?: string }> }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">Configurado pelo suporte</span>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">Integracao configurada pelo suporte. Entre em contato para alterar.</p>
    </CardContent>
  </Card>
)

// --- Google Calendar (conexao por vendedor) ---

// A agenda e do vendedor, nao da empresa: o evento nasce na agenda de quem
// atende. Nao ha nada para o admin configurar aqui, so para onde apontar.
const GoogleCalendarCompanyCard = () => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Google Agenda</CardTitle>
            <CardDescription>Reunioes agendadas no inbox viram eventos com convite por email</CardDescription>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
          Por vendedor
        </span>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cada vendedor conecta a propria conta Google. O evento nasce na agenda de quem esta
        atendendo, e o convite vai para o email do cliente.
      </p>
      <Button variant="outline" asChild>
        <Link to="/minha-conta?tab=integracoes">Conectar minha agenda</Link>
      </Button>
    </CardContent>
  </Card>
)

// --- Webhook card ---

const WebhookCard = ({
  integration,
  onRegenerate,
  onToggle,
  onDelete,
}: {
  integration: WebhookIntegrationWithDetails
  onRegenerate: (id: string) => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
}) => {
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const preset = (integration.config as { preset?: WebhookPreset })?.preset ?? 'generic'
  const presetLabel = PRESETS.find((p) => p.value === preset)?.label ?? 'Generico'

  const webhookUrl = `${supabaseUrl}/functions/v1/source-webhook`

  const copySnippet = () => {
    const snippet = `curl -X POST "${webhookUrl}" \\\n  -H "Authorization: Bearer ${integration.webhook_token}" \\\n  -H "Content-Type: application/json" \\\n  -d '${PRESET_EXAMPLES[preset]}'`
    navigator.clipboard.writeText(snippet)
    toast.success('Comando copiado!')
  }

  return (
    <>
      <Card className={`border-border/30 ${!integration.is_active ? 'opacity-60' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">{integration.lead_source_name}</CardTitle>
              <CardDescription className="text-xs">
                Pipeline: {integration.pipeline_name ?? 'Default'} | Preset: {presetLabel}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={integration.is_active} onChange={() => onToggle(integration.id, !integration.is_active)} />
                <div className="peer h-4 w-7 rounded-full bg-muted-foreground/40 after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-background after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-3" />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">URL</Label>
            <code className="block bg-muted px-2 py-1.5 rounded text-[11px] break-all">{webhookUrl}</code>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Token</Label>
            <code className="block bg-muted px-2 py-1.5 rounded text-[11px] break-all font-mono">{integration.webhook_token}</code>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copySnippet}>
              <Copy className="h-3 w-3" /> Copiar curl
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmRegenerate(true)}>
              <RefreshCw className="h-3 w-3" /> Regenerar token
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar token?</AlertDialogTitle>
            <AlertDialogDescription>O token atual deixara de funcionar imediatamente. Integrações que usam o token antigo precisarao ser atualizadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onRegenerate(integration.id); setConfirmRegenerate(false) }}>Regenerar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover webhook?</AlertDialogTitle>
            <AlertDialogDescription>A integracao sera removida e o token deixara de funcionar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { onDelete(integration.id); setConfirmDelete(false) }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// --- Create form ---

const CreateWebhookForm = ({ onClose }: { onClose: () => void }) => {
  const { data: sources } = useLeadSources()
  const { data: pipelines } = usePipelines()
  const createMutation = useCreateWebhookIntegration()

  const [sourceId, setSourceId] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [preset, setPreset] = useState<WebhookPreset>('generic')

  const canSave = sourceId && pipelineId

  const handleSave = async () => {
    if (!canSave) return
    await createMutation.mutateAsync({ sourceId, pipelineId, preset })
    onClose()
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Nova integracao webhook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Origem</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {sources?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pipeline destino</Label>
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {pipelines?.filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preset</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as WebhookPreset)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {preset && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Exemplo de payload ({PRESETS.find((p) => p.value === preset)?.label})</Label>
            <pre className="bg-muted px-2 py-1.5 rounded text-[10px] overflow-x-auto">{PRESET_EXAMPLES[preset]}</pre>
            {preset === 'meta_lead_ads' && (
              <p className="text-[10px] text-yellow-600">Nota: este preset espera payload achatado por middleware (Zapier, n8n, Make). NAO suporta webhook nativo do Meta.</p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!canSave || createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Criar webhook
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Webhooks tab ---

const WebhookIntegrations = () => {
  const { data: integrations, isLoading } = useWebhookIntegrations()
  const regenerateMutation = useRegenerateWebhookToken()
  const toggleMutation = useToggleWebhookIntegration()
  const deleteMutation = useDeleteWebhookIntegration()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Webhooks de Entrada</h3>
          <p className="text-xs text-muted-foreground">Receba leads de formularios, landing pages e plataformas de ads</p>
        </div>
        {!showCreate && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCreate(true)}>
            <Plus className="h-3 w-3" /> Nova integracao
          </Button>
        )}
      </div>

      {showCreate && <CreateWebhookForm onClose={() => setShowCreate(false)} />}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
        </div>
      )}

      {integrations && integrations.length === 0 && !showCreate && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum webhook configurado</p>
            <p className="text-xs text-muted-foreground mt-1">Crie uma integracao para receber leads via POST HTTP</p>
          </CardContent>
        </Card>
      )}

      {integrations?.map((integration) => (
        <WebhookCard
          key={integration.id}
          integration={integration}
          onRegenerate={(id) => regenerateMutation.mutate(id)}
          onToggle={(id, active) => toggleMutation.mutate({ id, active })}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      ))}
    </div>
  )
}

// --- Main tab ---

const IntegrationsTab = () => {
  // Quando o WhatsApp oficial esta em modo "gerenciar", esconde os outros canais
  // pra eles nao vazarem embaixo da gestao (Numeros/Templates).
  const [whatsappManaging, setWhatsappManaging] = useState(false)

  return (
    <Tabs defaultValue="channels">
      <TabsList>
        <TabsTrigger value="channels">Canais</TabsTrigger>
        <TabsTrigger value="calendar">Calendario</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        <TabsTrigger value="payments">Pagamentos</TabsTrigger>
      </TabsList>

      <TabsContent value="channels" className="mt-4 space-y-4">
        <WhatsAppConnectChoice onManagingChange={setWhatsappManaging} />
        {!whatsappManaging && (
          <>
            <HubManagedCard title="Instagram Business" description="DMs e comentarios do Instagram" icon={Globe} />
            <HubManagedCard title="Email (Brevo)" description="Envio de emails transacionais e lembretes" icon={Mail} />
          </>
        )}
      </TabsContent>

      <TabsContent value="calendar" className="mt-4">
        <GoogleCalendarCompanyCard />
      </TabsContent>

      <TabsContent value="webhooks" className="mt-4"><WebhookIntegrations /></TabsContent>
      <TabsContent value="payments" className="mt-4"><PaymentIntegrations /></TabsContent>
    </Tabs>
  )
}

export { IntegrationsTab }
