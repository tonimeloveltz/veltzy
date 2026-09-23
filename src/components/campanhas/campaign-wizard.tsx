import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useCampaignTemplates, useAudienceCount, useCreateCampaign, useDispatchCampaign } from '@/hooks/use-campaigns'
import { leadTemperatureConfig } from '@/lib/lead-config'
import { getTemplateBody, extractVariables } from '@/lib/template-render'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { LeadTemperature, AudienceFilter } from '@/types/database'

const TEMPERATURES: LeadTemperature[] = ['cold', 'warm', 'hot', 'fire']
const OFFICIAL_PROVIDER = 'cloud_api'

// Opcoes de mapeamento de variavel {{n}} → campo do lead (ou texto fixo).
const LEAD_FIELDS = [
  { value: 'lead.name', label: 'Nome do contato' },
  { value: 'lead.company_name', label: 'Empresa do contato' },
  { value: 'lead.phone', label: 'Telefone' },
  { value: '__fixed__', label: 'Texto fixo' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CampaignWizard({ open, onOpenChange }: Props) {
  const provider = useAuthStore((s) => s.company?.active_whatsapp_provider)
  const isNonOfficial = provider != null && provider !== OFFICIAL_PROVIDER
  const isCloudApi = provider === OFFICIAL_PROVIDER

  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [temperatures, setTemperatures] = useState<Set<LeadTemperature>>(new Set())
  // varMapping[n] = 'lead.x' ou, se fixo, o proprio texto.
  const [varMapping, setVarMapping] = useState<Record<string, string>>({})

  const { data: templates } = useCampaignTemplates()
  const selectedTemplate = templates?.find((t) => t.id === templateId)
  const bodyText = selectedTemplate ? getTemplateBody(selectedTemplate.components) : ''
  const variables = useMemo(() => extractVariables(bodyText), [bodyText])

  const audienceFilter: AudienceFilter = useMemo(
    () => (temperatures.size ? { temperature: [...temperatures] } : {}),
    [temperatures],
  )
  const { data: audienceCount, isFetching: countLoading } = useAudienceCount(audienceFilter, open && step >= 2)

  const createCampaign = useCreateCampaign()
  const dispatchCampaign = useDispatchCampaign()
  const busy = createCampaign.isPending || dispatchCampaign.isPending

  const reset = () => {
    setStep(1); setName(''); setTemplateId(''); setTemperatures(new Set()); setVarMapping({})
  }
  const close = () => { onOpenChange(false); setTimeout(reset, 200) }

  const toggleTemp = (t: LeadTemperature) => {
    setTemperatures((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  // Cloud API oficial só entrega template APROVADO — bloqueia a seleção de não-APPROVED.
  const templateNotApproved = isCloudApi && !!selectedTemplate && selectedTemplate.status !== 'APPROVED'
  const canNext1 = name.trim() !== '' && templateId !== '' && !templateNotApproved
  const canSend = (audienceCount ?? 0) > 0 && !busy && !templateNotApproved

  const buildMapping = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const v of variables) out[v] = varMapping[v] || 'lead.name'
    return out
  }

  const handleSend = async () => {
    try {
      const campaign = await createCampaign.mutateAsync({
        name: name.trim(),
        template_id: templateId,
        variable_mapping: buildMapping(),
        audience_filter: audienceFilter,
      })
      await dispatchCampaign.mutateAsync(campaign.id)
      close()
    } catch {
      /* toasts tratados nos hooks */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha · Etapa {step} de 3</DialogTitle>
        </DialogHeader>

        {/* Etapa 1: nome + template */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Nome da campanha</Label>
              <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promo Black Friday" />
            </div>
            <div className="space-y-1.5">
              <Label>Template (modelo da mensagem)</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} · {t.language}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bodyText && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Prévia</p>
                {bodyText}
              </div>
            )}
            {templateNotApproved && (
              <p className="text-sm text-red-600">
                Este template não está aprovado (status: {selectedTemplate?.status}). O canal oficial (Cloud API) só envia templates aprovados pela Meta.
              </p>
            )}
          </div>
        )}

        {/* Etapa 2: publico + contagem */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Público — temperatura do contato</Label>
              <div className="flex flex-wrap gap-2">
                {TEMPERATURES.map((t) => {
                  const on = temperatures.has(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTemp(t)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition',
                        on ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {leadTemperatureConfig[t].label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">Sem seleção = todos os contatos elegíveis.</p>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              {countLoading ? (
                <span className="text-muted-foreground">Calculando público…</span>
              ) : (
                <span><strong>{audienceCount ?? 0}</strong> contato(s) elegível(is) (exclui quem pediu opt-out e sem telefone).</span>
              )}
            </div>
          </div>
        )}

        {/* Etapa 3: variaveis + revisao + banner + enviar */}
        {step === 3 && (
          <div className="space-y-4">
            {variables.length > 0 && (
              <div className="space-y-2">
                <Label>Variáveis do template</Label>
                {variables.map((v) => {
                  const current = varMapping[v] ?? 'lead.name'
                  const isFixed = !current.startsWith('lead.')
                  return (
                    <div key={v} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-sm text-muted-foreground">{`{{${v}}}`}</span>
                      <Select
                        value={isFixed ? '__fixed__' : current}
                        onValueChange={(val) => setVarMapping((m) => ({ ...m, [v]: val === '__fixed__' ? '' : val }))}
                      >
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAD_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {isFixed && (
                        <Input
                          className="flex-1"
                          placeholder="Texto fixo"
                          value={current}
                          onChange={(e) => setVarMapping((m) => ({ ...m, [v]: e.target.value }))}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Campanha</span><span className="font-medium">{name}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Template</span><span className="font-medium">{selectedTemplate?.name}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Destinatários</span><span className="font-medium">{audienceCount ?? 0}</span></div>
            </div>

            {isNonOfficial && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium text-amber-700">Envio por canal não-oficial ({provider})</p>
                  <p className="text-amber-700/90">
                    O WhatsApp pode banir o número em disparo em massa. Para proteger, aplicamos automaticamente:
                    espaçamento de 30–90s entre envios, teto de 50/dia por número e janela das 08h às 20h.
                    Prefira público que já interagiu e comece com volume baixo.
                  </p>
                </div>
              </div>
            )}

            {isCloudApi && (
              <div className="flex gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="space-y-1">
                  <p className="font-medium text-emerald-700">Envio por canal oficial (Cloud API)</p>
                  <p className="text-emerald-700/90">
                    Disparo via template aprovado pela Meta. Sem os limites anti-ban do canal não-oficial —
                    seguem as regras da Meta por categoria/qualidade do template.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => (step === 1 ? close() : setStep(step - 1))} disabled={busy}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !canNext1}>Continuar</Button>
          ) : (
            <Button onClick={handleSend} disabled={!canSend}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              Enviar agora
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
