// Estado do formulário de campanha (página /campanhas/nova e /campanhas/:id/editar).
// Funções puras: rascunho vazio, rascunho a partir de uma campanha salva, filtro de público
// e payload de gravação.
import { buildMessageVariants, type VariantDraft } from '@/lib/campaign-variants'
import type { CreateCampaignInput } from '@/services/campaigns.service'
import type { AntiBanConfig, AudienceFilter, BlastCampaign, ThrottleConfig } from '@/types/database'

export type AudienceMode = 'all' | 'stage' | 'source' | 'tag' | 'manual'
export type MessageMode = 'free' | 'template'
export type FollowupMode = 'immediate' | 'no_reply'

export interface CampaignDraft {
  name: string
  audienceMode: AudienceMode
  stageIds: string[]
  sourceId: string
  tags: string[]
  manualIds: string[]
  excludeRecent: boolean
  excludeDays: number
  msgMode: MessageMode
  messageBody: string
  /** Versões geradas com IA (sem a original). Toda versão precisa ser aprovada. */
  variants: VariantDraft[]
  variantsCleared: boolean
  templateId: string
  varMapping: Record<string, string>
  antiBan: ThrottleConfig | null
  /** undefined = ainda não escolhido (o seletor aplica o default); null = nenhum. */
  sender: string | null | undefined
  senderForce: boolean
  /** Valor de input datetime-local (hora local). '' = enviar agora. */
  scheduledAt: string
  followupCadenceId: string
  followupMode: FollowupMode
  followupDays: number
}

export type DraftPatch = Partial<CampaignDraft>

export const emptyDraft = (isCloudApi: boolean): CampaignDraft => ({
  name: '',
  audienceMode: 'all', stageIds: [], sourceId: '', tags: [], manualIds: [], excludeRecent: false, excludeDays: 7,
  msgMode: isCloudApi ? 'template' : 'free', messageBody: '', variants: [], variantsCleared: false, templateId: '', varMapping: {},
  antiBan: null, sender: undefined, senderForce: false, scheduledAt: '',
  followupCadenceId: '', followupMode: 'immediate', followupDays: 3,
})

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const modeFromFilter = (f: AudienceFilter): AudienceMode => {
  if (f.manual_ids) return 'manual'
  if (f.stage_id?.length) return 'stage'
  if (f.source_id) return 'source'
  if (f.tags?.length) return 'tag'
  return 'all'
}

/** Rascunho a partir de uma campanha salva (edição). */
export const draftFromCampaign = (c: BlastCampaign, isCloudApi: boolean): CampaignDraft => {
  const f = c.audience_filter ?? {}
  const { sender_instance, sender_force, ...throttle } = c.anti_ban ?? {}
  const hasThrottle = Object.keys(throttle).length > 0
  const [, ...versions] = c.message_variants ?? []
  return {
    ...emptyDraft(isCloudApi),
    name: c.name,
    audienceMode: modeFromFilter(f),
    stageIds: f.stage_id ?? [],
    sourceId: f.source_id ?? '',
    tags: f.tags ?? [],
    manualIds: f.manual_ids ?? [],
    excludeRecent: !!f.exclude_recent_days,
    excludeDays: f.exclude_recent_days || 7,
    msgMode: c.template_id ? 'template' : 'free',
    messageBody: c.message_body ?? '',
    variants: versions.map((text) => ({ text, status: 'approved' as const })),
    templateId: c.template_id ?? '',
    varMapping: c.variable_mapping ?? {},
    antiBan: hasThrottle ? throttle : null,
    sender: c.anti_ban ? (sender_instance ?? null) : undefined,
    senderForce: !!sender_force,
    scheduledAt: toLocalInput(c.scheduled_at),
    followupCadenceId: c.followup_cadence_id ?? '',
    followupMode: c.followup_mode === 'no_reply' ? 'no_reply' : 'immediate',
    followupDays: c.followup_delay_days || 3,
  }
}

export const buildAudienceFilter = (d: CampaignDraft): AudienceFilter => {
  const f: AudienceFilter = {}
  if (d.audienceMode === 'stage' && d.stageIds.length) f.stage_id = d.stageIds
  if (d.audienceMode === 'source' && d.sourceId) f.source_id = d.sourceId
  if (d.audienceMode === 'tag' && d.tags.length) f.tags = d.tags
  if (d.audienceMode === 'manual') f.manual_ids = d.manualIds
  if (d.excludeRecent && d.excludeDays > 0) f.exclude_recent_days = d.excludeDays
  return f
}

/** Data agendada válida (futura) em ISO, ou null = agora. */
export const scheduledIso = (d: CampaignDraft): string | null => {
  if (!d.scheduledAt) return null
  const t = new Date(d.scheduledAt).getTime()
  return t > Date.now() ? new Date(t).toISOString() : null
}

interface BuildInputOptions {
  showSender: boolean
  templateVariables: string[]
}

export const buildCampaignInput = (d: CampaignDraft, opts: BuildInputOptions): CreateCampaignInput => {
  const mapping: Record<string, string> = {}
  for (const v of opts.templateVariables) mapping[v] = d.varMapping[v] || 'lead.first_name'
  // Número de envio mora no jsonb anti_ban (sem migration). Sem nada escolhido = null.
  const antiBan: AntiBanConfig | null = opts.showSender && d.sender
    ? { ...(d.antiBan ?? {}), sender_instance: d.sender, sender_force: d.senderForce }
    : d.antiBan
  const free = d.msgMode === 'free'
  return {
    name: d.name.trim(),
    template_id: free ? null : d.templateId,
    message_body: free ? d.messageBody.trim() : null,
    message_variants: free ? buildMessageVariants(d.messageBody, d.variants) : null,
    variable_mapping: free ? {} : mapping,
    audience_filter: buildAudienceFilter(d),
    anti_ban: antiBan,
    scheduled_at: scheduledIso(d),
    followup_cadence_id: d.followupCadenceId || null,
    followup_mode: d.followupCadenceId ? d.followupMode : 'none',
    followup_delay_days: d.followupCadenceId && d.followupMode === 'no_reply' ? d.followupDays : 0,
  }
}
