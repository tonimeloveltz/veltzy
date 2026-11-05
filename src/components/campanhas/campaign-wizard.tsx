import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import {
  useAudienceCount, useCampaign, useCampaignTemplates, useCreateCampaign, useDispatchCampaign,
  useResetCampaign, useUpdateCampaign,
} from '@/hooks/use-campaigns'
import { useWhatsAppNumbers } from '@/hooks/use-whatsapp-numbers'
import { getTemplateBody, extractVariables } from '@/lib/template-render'
import { allVariantsReady } from '@/lib/campaign-variants'
import {
  buildAudienceFilter, buildCampaignInput, draftFromCampaign, emptyDraft, type DraftPatch,
} from '@/lib/campaign-draft'
import { ANTI_BAN_DEFAULTS } from '@/components/campanhas/anti-ban-settings'
import { WizardStepper } from '@/components/campanhas/wizard-stepper'
import { AudienceStep } from '@/components/campanhas/audience-step'
import { MessageStep } from '@/components/campanhas/message-step'
import { SettingsStep } from '@/components/campanhas/settings-step'
import { ReviewStep } from '@/components/campanhas/review-step'
import { CampaignSummaryPanel, type CampaignSummary } from '@/components/campanhas/campaign-summary-panel'
import { CampaignMediaInput } from '@/components/campanhas/campaign-media-input'
import { removeCampaignMedia } from '@/services/campaigns.service'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const OFFICIAL_PROVIDER = 'cloud_api'
const SENDER_PROVIDERS = ['waha', 'evolution', OFFICIAL_PROVIDER]
const EDITABLE_STATUS = ['draft', 'scheduled']

interface CampaignWizardProps {
  /** Presente = edição (só rascunho/agendada). */
  campaignId?: string
}

export function CampaignWizard({ campaignId }: CampaignWizardProps) {
  const navigate = useNavigate()
  const provider = useAuthStore((s) => s.company?.active_whatsapp_provider)
  const isCloudApi = provider === OFFICIAL_PROVIDER
  const isNonOfficial = provider != null && !isCloudApi
  const showSender = provider != null && SENDER_PROVIDERS.includes(provider)
  const isEdit = !!campaignId

  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState(() => emptyDraft(isCloudApi))
  const patch = useCallback((p: DraftPatch) => setDraft((d) => ({ ...d, ...p })), [])

  // Edição: carrega uma vez; campanha que já começou a enviar não é editável.
  const { data: existing, isLoading: loadingExisting } = useCampaign(campaignId)
  const [loaded, setLoaded] = useState(!isEdit)
  useEffect(() => {
    if (!isEdit || loaded || loadingExisting) return
    if (!existing || !EDITABLE_STATUS.includes(existing.status)) {
      toast.error(existing ? 'Esta campanha já começou a enviar e não pode ser editada.' : 'Campanha não encontrada.')
      navigate('/campanhas', { replace: true })
      return
    }
    setDraft(draftFromCampaign(existing, isCloudApi))
    setLoaded(true)
  }, [isEdit, loaded, loadingExisting, existing, isCloudApi, navigate])

  const { data: templates } = useCampaignTemplates()
  const { data: numbers } = useWhatsAppNumbers()
  const selectedTemplate = templates?.find((t) => t.id === draft.templateId)
  const templateBody = selectedTemplate ? getTemplateBody(selectedTemplate.components) : ''
  const variables = useMemo(() => extractVariables(templateBody), [templateBody])

  const audienceFilter = useMemo(() => buildAudienceFilter(draft), [draft])
  const { data: audienceCount, isFetching: countLoading } = useAudienceCount(audienceFilter, loaded)

  const createCampaign = useCreateCampaign()
  const updateCampaign = useUpdateCampaign()
  const resetCampaign = useResetCampaign()
  const dispatchCampaign = useDispatchCampaign()
  const busy = createCampaign.isPending || updateCampaign.isPending || resetCampaign.isPending || dispatchCampaign.isPending

  const templateNotApproved = isCloudApi && !!selectedTemplate && selectedTemplate.status !== 'APPROVED'
  const scheduledInPast = draft.scheduledAt !== '' && new Date(draft.scheduledAt).getTime() <= Date.now()
  const isScheduled = draft.scheduledAt !== '' && !scheduledInPast

  // Com anexo, o texto é opcional (vira legenda); versões continuam exigindo texto.
  const hasText = draft.messageBody.trim() !== ''
  const hasMedia = isNonOfficial && !!draft.media
  const messageOk = draft.msgMode === 'free'
    ? (hasText || hasMedia) && (draft.variants.length === 0 || allVariantsReady(draft.messageBody, draft.variants))
    : (draft.templateId !== '' && !templateNotApproved)
  const canNext1 = draft.name.trim() !== '' && (audienceCount ?? 0) > 0
  const canSend = (audienceCount ?? 0) > 0 && messageOk && !busy && !scheduledInPast
  const canSaveDraft = isEdit && existing?.status === 'draft' && draft.name.trim() !== '' && !busy

  // Estimativa (client-side): N * intervalo médio.
  const estimate = useMemo(() => {
    const n = audienceCount ?? 0
    if (n <= 1) return null
    const ab = { ...ANTI_BAN_DEFAULTS, ...(draft.antiBan ?? {}) }
    const totalSec = (n - 1) * (isCloudApi ? 1 : (ab.delay_min + ab.delay_max) / 2)
    const min = Math.round(totalSec / 60)
    return min < 1 ? 'menos de 1 min' : `~${min} min`
  }, [audienceCount, draft.antiBan, isCloudApi])

  const isFree = draft.msgMode === 'free'
  const summary: CampaignSummary = {
    name: draft.name,
    audienceCount,
    audienceLoading: countLoading,
    previewText: isFree ? draft.messageBody : templateBody,
    versions: isFree && draft.variants.length ? draft.variants.length + 1 : 0,
    media: isFree && hasMedia && draft.media ? { type: draft.media.type, name: draft.media.name, url: draft.media.url } : null,
    showSender,
    senderLabel: draft.sender ? (numbers?.find((n) => n.ref === draft.sender)?.displayNumber ?? draft.sender) : null,
    whenLabel: isScheduled ? new Date(draft.scheduledAt).toLocaleString('pt-BR') : 'Agora',
    estimate,
  }
  const messageLabel = isFree
    ? (draft.variants.length ? `Texto livre · ${draft.variants.length + 1} versões` : 'Texto livre')
    : (selectedTemplate?.name ?? 'Template')

  const handleSave = async (send: boolean) => {
    const built = buildCampaignInput(draft, { showSender, templateVariables: variables })
    const input = isNonOfficial ? built : { ...built, media_url: null, media_type: null, media_name: null, media_path: null }
    try {
      let id = campaignId
      if (campaignId) {
        // Agendada já tem fila: cancela e volta a rascunho antes de regravar.
        if (existing?.status === 'scheduled') await resetCampaign.mutateAsync(campaignId)
        await updateCampaign.mutateAsync({ id: campaignId, input: send ? input : { ...input, scheduled_at: null } })
        // Anexo trocado/removido: o arquivo antigo sai do storage.
        const oldPath = existing?.media_path
        if (oldPath && !existing?.media_purged_at && oldPath !== input.media_path) removeCampaignMedia(oldPath).catch(() => {})
      } else {
        id = (await createCampaign.mutateAsync(input)).id
      }
      if (send && id) await dispatchCampaign.mutateAsync(id)
      else toast.success('Rascunho salvo.')
      navigate('/campanhas')
    } catch {
      /* toasts tratados nos hooks */
    }
  }

  if (!loaded) {
    return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <WizardStepper step={step} />

        {step === 1 && <AudienceStep draft={draft} onChange={patch} />}
        {step === 2 && (
          <MessageStep
            draft={draft}
            onChange={patch}
            isCloudApi={isCloudApi}
            templates={templates}
            templateBody={templateBody}
            templateVariables={variables}
            templateNotApproved={templateNotApproved}
            mediaSlot={isNonOfficial && (
              <CampaignMediaInput
                value={draft.media}
                onChange={(media) => patch({ media })}
                savedPath={existing?.media_path ?? null}
                expired={draft.mediaExpired}
                hasText={hasText}
              />
            )}
          />
        )}
        {step === 3 && (
          <SettingsStep draft={draft} onChange={patch} provider={provider} showSender={showSender} scheduledInPast={scheduledInPast} />
        )}
        {step === 4 && (
          <ReviewStep summary={summary} messageLabel={messageLabel} senderForce={draft.senderForce} isNonOfficial={isNonOfficial} />
        )}

        <CampaignSummaryPanel summary={summary} compact className="lg:hidden" />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" onClick={() => (step === 1 ? navigate('/campanhas') : setStep(step - 1))} disabled={busy}>
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>
          <div className="flex flex-wrap gap-2">
            {canSaveDraft && (
              <Button variant="outline" onClick={() => handleSave(false)}>Salvar sem enviar</Button>
            )}
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} disabled={(step === 1 && !canNext1) || (step === 2 && !messageOk)}>
                Continuar
              </Button>
            ) : (
              <Button onClick={() => handleSave(true)} disabled={!canSend}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                {isScheduled ? 'Agendar' : 'Confirmar e Disparar'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <CampaignSummaryPanel summary={summary} className="lg:sticky lg:top-6" />
      </aside>
    </div>
  )
}
