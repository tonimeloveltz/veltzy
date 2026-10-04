import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useCampaignTemplates, useAudienceCount, useCreateCampaign, useDispatchCampaign } from '@/hooks/use-campaigns'
import { useCadences } from '@/hooks/use-cadences'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { getTemplateBody, extractVariables } from '@/lib/template-render'
import { StageMultiSelect } from '@/components/mkt-ativo/stage-multi-select'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { ManualContactPicker } from '@/components/campanhas/manual-contact-picker'
import { AntiBanSettings, ANTI_BAN_DEFAULTS } from '@/components/campanhas/anti-ban-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { AudienceFilter, ThrottleConfig } from '@/types/database'

const OFFICIAL_PROVIDER = 'cloud_api'
type AudienceMode = 'all' | 'stage' | 'source' | 'tag' | 'manual'
const AUDIENCE_MODES: { value: AudienceMode; label: string }[] = [
  { value: 'all', label: 'Todos ativos' },
  { value: 'stage', label: 'Por etapa' },
  { value: 'source', label: 'Por origem' },
  { value: 'tag', label: 'Por tag' },
  { value: 'manual', label: 'Seleção manual' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CampaignWizard({ open, onOpenChange }: Props) {
  const provider = useAuthStore((s) => s.company?.active_whatsapp_provider)
  const isCloudApi = provider === OFFICIAL_PROVIDER
  const isNonOfficial = provider != null && !isCloudApi

  const [step, setStep] = useState(1)
  const [name, setName] = useState('')

  // Passo 1 — público
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all')
  const [stageIds, setStageIds] = useState<string[]>([])
  const [sourceId, setSourceId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [manualIds, setManualIds] = useState<string[]>([])
  const [excludeRecent, setExcludeRecent] = useState(false)
  const [excludeDays, setExcludeDays] = useState(7)

  // Passo 2 — mensagem. Cloud API só aceita template; demais começam em texto livre.
  const [msgMode, setMsgMode] = useState<'free' | 'template'>(isCloudApi ? 'template' : 'free')
  const [messageBody, setMessageBody] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [varMapping, setVarMapping] = useState<Record<string, string>>({})

  // Passo 3 — config
  const [antiBan, setAntiBan] = useState<ThrottleConfig | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [followupCadenceId, setFollowupCadenceId] = useState('')
  const [followupMode, setFollowupMode] = useState<'immediate' | 'no_reply'>('immediate')
  const [followupDays, setFollowupDays] = useState(3)

  const { data: cadences } = useCadences()
  const { data: leadSources } = useLeadSources()
  const { data: templates } = useCampaignTemplates()
  const selectedTemplate = templates?.find((t) => t.id === templateId)
  const bodyText = selectedTemplate ? getTemplateBody(selectedTemplate.components) : ''
  const variables = useMemo(() => extractVariables(bodyText), [bodyText])

  const audienceFilter: AudienceFilter = useMemo(() => {
    const f: AudienceFilter = {}
    if (audienceMode === 'stage' && stageIds.length) f.stage_id = stageIds
    if (audienceMode === 'source' && sourceId) f.source_id = sourceId
    if (audienceMode === 'tag' && tags.length) f.tags = tags
    if (audienceMode === 'manual') f.manual_ids = manualIds
    if (excludeRecent && excludeDays > 0) f.exclude_recent_days = excludeDays
    return f
  }, [audienceMode, stageIds, sourceId, tags, manualIds, excludeRecent, excludeDays])
  const { data: audienceCount, isFetching: countLoading } = useAudienceCount(audienceFilter, open && step >= 1)

  const createCampaign = useCreateCampaign()
  const dispatchCampaign = useDispatchCampaign()
  const busy = createCampaign.isPending || dispatchCampaign.isPending

  const reset = () => {
    setStep(1); setName('')
    setAudienceMode('all'); setStageIds([]); setSourceId(''); setTags([]); setManualIds([]); setExcludeRecent(false); setExcludeDays(7)
    setMsgMode(isCloudApi ? 'template' : 'free'); setMessageBody(''); setTemplateId(''); setVarMapping({})
    setAntiBan(null); setScheduledAt(''); setFollowupCadenceId(''); setFollowupMode('immediate'); setFollowupDays(3)
  }
  const close = () => { onOpenChange(false); setTimeout(reset, 200) }

  const templateNotApproved = isCloudApi && !!selectedTemplate && selectedTemplate.status !== 'APPROVED'
  const scheduledInPast = scheduledAt !== '' && new Date(scheduledAt).getTime() <= Date.now()
  const isScheduled = scheduledAt !== '' && !scheduledInPast

  const messageOk = msgMode === 'free'
    ? messageBody.trim() !== ''
    : (templateId !== '' && !templateNotApproved)
  const canNext1 = name.trim() !== '' && (audienceCount ?? 0) > 0
  const canNext2 = messageOk
  const canSend = (audienceCount ?? 0) > 0 && messageOk && !busy && !scheduledInPast

  const buildMapping = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const v of variables) out[v] = varMapping[v] || 'lead.name'
    return out
  }

  const handleSend = async () => {
    try {
      const campaign = await createCampaign.mutateAsync({
        name: name.trim(),
        template_id: msgMode === 'template' ? templateId : null,
        message_body: msgMode === 'free' ? messageBody.trim() : null,
        variable_mapping: msgMode === 'template' ? buildMapping() : {},
        audience_filter: audienceFilter,
        anti_ban: antiBan,
        scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : null,
        followup_cadence_id: followupCadenceId || null,
        followup_mode: followupCadenceId ? followupMode : 'none',
        followup_delay_days: followupCadenceId && followupMode === 'no_reply' ? followupDays : 0,
      })
      await dispatchCampaign.mutateAsync(campaign.id)
      close()
    } catch {
      /* toasts tratados nos hooks */
    }
  }

  // Estimativa de tempo (client-side): N * delay médio, respeitando teto/dia por número.
  const estimate = useMemo(() => {
    const n = audienceCount ?? 0
    if (n <= 1) return null
    const ab = { ...ANTI_BAN_DEFAULTS, ...(antiBan ?? {}) }
    const avg = (ab.delay_min + ab.delay_max) / 2
    const totalSec = (n - 1) * (isCloudApi ? 1 : avg)
    const min = Math.round(totalSec / 60)
    return min < 1 ? '< 1 min' : `~${min} min`
  }, [audienceCount, antiBan, isCloudApi])

  const audienceCard = (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <Users className="h-4 w-4 text-muted-foreground" />
      {countLoading ? (
        <span className="text-muted-foreground">Calculando público…</span>
      ) : (
        <span><strong>{audienceCount ?? 0}</strong> contato(s) será(ão) impactado(s) (exclui opt-out e sem telefone).</span>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha · Etapa {step} de 4</DialogTitle>
        </DialogHeader>

        {/* Etapa 1: Destinatários */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Nome da campanha</Label>
              <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promo Black Friday" />
            </div>
            <div className="space-y-2">
              <Label>Público</Label>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setAudienceMode(m.value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition',
                      audienceMode === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {audienceMode === 'stage' && <StageMultiSelect value={stageIds} onChange={setStageIds} />}
            {audienceMode === 'source' && (
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="Escolha a origem" /></SelectTrigger>
                <SelectContent>
                  {(leadSources ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {audienceMode === 'tag' && <LeadTagsInput value={tags} onChange={setTags} />}
            {audienceMode === 'manual' && <ManualContactPicker value={manualIds} onChange={setManualIds} />}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={excludeRecent} onChange={(e) => setExcludeRecent(e.target.checked)} />
              Excluir quem já recebeu mensagem nos últimos
              <Input type="number" min={1} className="h-8 w-16" value={String(excludeDays)} onChange={(e) => setExcludeDays(Number(e.target.value))} disabled={!excludeRecent} />
              dias
            </label>
            {audienceCard}
          </div>
        )}

        {/* Etapa 2: Mensagem */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isCloudApi}
                onClick={() => setMsgMode('free')}
                className={cn('rounded-md border px-3 py-1.5 text-sm', msgMode === 'free' ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground', isCloudApi && 'cursor-not-allowed opacity-50')}
              >
                Escrever agora
              </button>
              <button
                type="button"
                onClick={() => setMsgMode('template')}
                className={cn('rounded-md border px-3 py-1.5 text-sm', msgMode === 'template' ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground')}
              >
                Usar template
              </button>
            </div>
            {isCloudApi && (
              <p className="text-xs text-muted-foreground">Canal oficial (Cloud API) exige template aprovado pela Meta.</p>
            )}

            {msgMode === 'free' && !isCloudApi && (
              <div className="space-y-1.5">
                <Label htmlFor="camp-body">Mensagem</Label>
                <textarea
                  id="camp-body"
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={5}
                  placeholder="Escreva a mensagem. Variáveis: {{nome}}, {{telefone}}, {{empresa}}"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">Variáveis: {'{{nome}}'} · {'{{telefone}}'} · {'{{empresa}}'}</p>
              </div>
            )}

            {msgMode === 'template' && (
              <>
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                    <SelectContent>
                      {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.language}</SelectItem>)}
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
                  <p className="text-sm text-red-600">Template não aprovado (status: {selectedTemplate?.status}). O Cloud API só envia templates aprovados pela Meta.</p>
                )}
                {variables.length > 0 && (
                  <div className="space-y-2">
                    <Label>Variáveis do template</Label>
                    {variables.map((v) => {
                      const current = varMapping[v] ?? 'lead.name'
                      const isFixed = !current.startsWith('lead.')
                      return (
                        <div key={v} className="flex items-center gap-2">
                          <span className="w-10 shrink-0 text-sm text-muted-foreground">{`{{${v}}}`}</span>
                          <Select value={isFixed ? '__fixed__' : current} onValueChange={(val) => setVarMapping((m) => ({ ...m, [v]: val === '__fixed__' ? '' : val }))}>
                            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lead.name">Nome do contato</SelectItem>
                              <SelectItem value="lead.company_name">Empresa do contato</SelectItem>
                              <SelectItem value="lead.phone">Telefone</SelectItem>
                              <SelectItem value="__fixed__">Texto fixo</SelectItem>
                            </SelectContent>
                          </Select>
                          {isFixed && <Input className="flex-1" placeholder="Texto fixo" value={current} onChange={(e) => setVarMapping((m) => ({ ...m, [v]: e.target.value }))} />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Etapa 3: Configurações */}
        {step === 3 && (
          <div className="space-y-4">
            <AntiBanSettings value={antiBan} onChange={setAntiBan} />
            <div className="space-y-1.5">
              <Label htmlFor="camp-scheduled">Quando enviar (opcional)</Label>
              <Input id="camp-scheduled" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              {scheduledInPast ? (
                <p className="text-xs text-red-600">Escolha uma data futura.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Vazio = enviar agora.</p>
              )}
            </div>
            {estimate && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                Estimativa: {estimate} para {audienceCount} contato(s).
              </div>
            )}
            <div className="space-y-1.5 rounded-md border p-3">
              <Label>Follow-up (opcional)</Label>
              <Select value={followupCadenceId || 'none'} onValueChange={(v) => setFollowupCadenceId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem follow-up" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem follow-up</SelectItem>
                  {(cadences ?? []).filter((c) => c.is_enabled).map((c) => <SelectItem key={c.id} value={c.id}>Iniciar automação: {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {followupCadenceId && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button type="button" onClick={() => setFollowupMode('immediate')} className={cn('rounded-full border px-3 py-1 text-sm', followupMode === 'immediate' ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground')}>Ao concluir</button>
                  <button type="button" onClick={() => setFollowupMode('no_reply')} className={cn('rounded-full border px-3 py-1 text-sm', followupMode === 'no_reply' ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground')}>Sem resposta após</button>
                  {followupMode === 'no_reply' && (
                    <span className="flex items-center gap-1 text-sm">
                      <Input type="number" min={1} className="w-16" value={String(followupDays)} onChange={(e) => setFollowupDays(Number(e.target.value))} /> dias
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Etapa 4: Revisão */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Campanha</span><span className="font-medium">{name}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Mensagem</span><span className="font-medium">{msgMode === 'free' ? 'Texto livre' : (selectedTemplate?.name ?? 'Template')}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Destinatários</span><span className="font-medium">{audienceCount ?? 0}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Quando</span><span className="font-medium">{isScheduled ? new Date(scheduledAt).toLocaleString('pt-BR') : 'Agora'}</span></div>
            </div>
            {isNonOfficial && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-amber-700/90">Canal não-oficial ({provider}). A proteção anti-bloqueio da etapa anterior é aplicada no envio.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => (step === 1 ? close() : setStep(step - 1))} disabled={busy}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            >
              Continuar
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!canSend}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {isScheduled ? 'Agendar' : 'Confirmar e Disparar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
