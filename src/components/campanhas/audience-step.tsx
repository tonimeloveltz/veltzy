import { useLeadSources } from '@/hooks/use-lead-sources'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { ManualContactPicker } from '@/components/campanhas/manual-contact-picker'
import { AudienceModeCards } from '@/components/campanhas/audience-mode-cards'
import { StageGroupSelect } from '@/components/campanhas/stage-group-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { CampaignDraft, DraftPatch } from '@/lib/campaign-draft'

interface AudienceStepProps {
  draft: CampaignDraft
  onChange: (patch: DraftPatch) => void
}

export function AudienceStep({ draft, onChange }: AudienceStepProps) {
  const { data: leadSources } = useLeadSources()

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="camp-name">Nome da campanha</Label>
        <Input id="camp-name" value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Ex: Promo Black Friday" />
      </div>

      <div className="space-y-2">
        <Label>Público</Label>
        <AudienceModeCards value={draft.audienceMode} onChange={(audienceMode) => onChange({ audienceMode })} />
      </div>

      {draft.audienceMode === 'stage' && (
        <StageGroupSelect value={draft.stageIds} onChange={(stageIds) => onChange({ stageIds })} />
      )}
      {draft.audienceMode === 'source' && (
        <Select value={draft.sourceId} onValueChange={(sourceId) => onChange({ sourceId })}>
          <SelectTrigger><SelectValue placeholder="Escolha a origem" /></SelectTrigger>
          <SelectContent>
            {(leadSources ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {draft.audienceMode === 'tag' && <LeadTagsInput value={draft.tags} onChange={(tags) => onChange({ tags })} allowCreate={false} />}
      {draft.audienceMode === 'manual' && (
        <ManualContactPicker value={draft.manualIds} onChange={(manualIds) => onChange({ manualIds })} />
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Switch
          id="camp-exclude-recent"
          checked={draft.excludeRecent}
          onCheckedChange={(excludeRecent) => onChange({ excludeRecent })}
        />
        <label htmlFor="camp-exclude-recent">Não enviar para quem recebeu mensagem nos últimos</label>
        <Input
          type="number"
          min={1}
          aria-label="Dias"
          className="h-8 w-16"
          value={String(draft.excludeDays)}
          onChange={(e) => onChange({ excludeDays: Number(e.target.value) })}
          disabled={!draft.excludeRecent}
        />
        <span>dias</span>
      </div>
    </div>
  )
}
