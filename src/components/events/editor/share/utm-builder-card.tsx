import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EditorSection } from '@/components/events/editor/editor-section'
import { CopyField } from '@/components/events/editor/share/copy-field'
import { trackedUrl } from '@/lib/events/share-text'

const FIELDS = [
  { key: 'utm_source', label: 'Origem (utm_source)', placeholder: 'instagram' },
  { key: 'utm_medium', label: 'Mídia (utm_medium)', placeholder: 'stories' },
  { key: 'utm_campaign', label: 'Campanha (utm_campaign)', placeholder: 'lancamento' },
] as const

/** Montador de UTM: o link gerado vai para a origem do inscrito e do negócio. */
export const UtmBuilderCard = ({ url }: { url: string }) => {
  const [params, setParams] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' })
  return (
    <EditorSection title="Link com UTM" description="Para anúncio, e-mail ou post. A origem aparece nos inscritos e no painel.">
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input id={f.key} placeholder={f.placeholder} value={params[f.key]}
              onChange={(e) => setParams({ ...params, [f.key]: e.target.value })} />
          </div>
        ))}
      </div>
      <CopyField value={trackedUrl(url, params)} />
    </EditorSection>
  )
}
