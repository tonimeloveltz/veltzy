import { Checkbox } from '@/components/ui/checkbox'
import { marketingText } from '@/lib/events/consent-texts'

interface ConsentCheckboxesProps {
  privacyUrl: string | null
  organizer: string
  privacy: boolean
  marketing: boolean
  privacyError: boolean
  onChange: (next: { privacy: boolean; marketing: boolean }) => void
}

/** Aceites da LGPD: Politica obrigatoria; marketing separado e desmarcado. O texto gravado e o do servidor. */
export const ConsentCheckboxes = (p: ConsentCheckboxesProps) => (
  <div className="space-y-2 text-sm">
    <label className="flex cursor-pointer items-start gap-2">
      <Checkbox className="mt-0.5" checked={p.privacy} onCheckedChange={(c) => p.onChange({ privacy: c === true, marketing: p.marketing })} />
      <span>
        Li e aceito a{' '}
        {p.privacyUrl ? <a href={p.privacyUrl} target="_blank" rel="noopener noreferrer" className="underline">Política de Privacidade</a> : 'Política de Privacidade'}
        <span className="text-destructive"> *</span>
      </span>
    </label>
    {p.privacyError && <p className="text-xs text-destructive">Para se inscrever, aceite a Política de Privacidade.</p>}
    <label className="flex cursor-pointer items-start gap-2">
      <Checkbox className="mt-0.5" checked={p.marketing} onCheckedChange={(c) => p.onChange({ privacy: p.privacy, marketing: c === true })} />
      <span>{marketingText(p.organizer)}</span>
    </label>
  </div>
)
