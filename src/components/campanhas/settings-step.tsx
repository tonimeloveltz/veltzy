import { cn } from '@/lib/utils'
import { useCadences } from '@/hooks/use-cadences'
import { AntiBanSettings } from '@/components/campanhas/anti-ban-settings'
import { SenderNumberSelect } from '@/components/campanhas/sender-number-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { CampaignDraft, DraftPatch } from '@/lib/campaign-draft'

interface SettingsStepProps {
  draft: CampaignDraft
  onChange: (patch: DraftPatch) => void
  provider: string | null | undefined
  showSender: boolean
  scheduledInPast: boolean
}

const pill = (on: boolean) => cn(
  'rounded-full border px-3 py-1 text-sm',
  on ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground',
)

export function SettingsStep({ draft, onChange, provider, showSender, scheduledInPast }: SettingsStepProps) {
  const { data: cadences } = useCadences()

  return (
    <div className="space-y-4">
      {showSender && provider && (
        <SenderNumberSelect
          provider={provider}
          value={draft.sender}
          onChange={(sender) => onChange({ sender })}
          force={draft.senderForce}
          onForceChange={(senderForce) => onChange({ senderForce })}
        />
      )}
      <AntiBanSettings value={draft.antiBan} onChange={(antiBan) => onChange({ antiBan })} />
      <div className="space-y-1.5">
        <Label htmlFor="camp-scheduled">Quando enviar (opcional)</Label>
        <Input id="camp-scheduled" type="datetime-local" value={draft.scheduledAt} onChange={(e) => onChange({ scheduledAt: e.target.value })} />
        {scheduledInPast ? (
          <p className="text-xs text-destructive">Escolha uma data futura.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Vazio = enviar agora.</p>
        )}
      </div>
      <div className="space-y-1.5 rounded-md border p-3">
        <Label>Follow-up (opcional)</Label>
        <Select value={draft.followupCadenceId || 'none'} onValueChange={(v) => onChange({ followupCadenceId: v === 'none' ? '' : v })}>
          <SelectTrigger><SelectValue placeholder="Sem follow-up" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem follow-up</SelectItem>
            {(cadences ?? []).filter((c) => c.is_enabled).map((c) => <SelectItem key={c.id} value={c.id}>Iniciar automação: {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {draft.followupCadenceId && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => onChange({ followupMode: 'immediate' })} className={pill(draft.followupMode === 'immediate')}>Ao concluir</button>
            <button type="button" onClick={() => onChange({ followupMode: 'no_reply' })} className={pill(draft.followupMode === 'no_reply')}>Sem resposta após</button>
            {draft.followupMode === 'no_reply' && (
              <span className="flex items-center gap-1 text-sm">
                <Input type="number" min={1} className="w-16" value={String(draft.followupDays)} onChange={(e) => onChange({ followupDays: Number(e.target.value) })} /> dias
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
