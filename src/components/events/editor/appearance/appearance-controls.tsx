import { useFormContext, useWatch } from 'react-hook-form'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EditorSection } from '@/components/events/editor/editor-section'
import { AssetUpload } from '@/components/events/editor/appearance/asset-upload'
import { ColorField } from '@/components/events/editor/appearance/color-field'
import { useUploadEventAsset } from '@/hooks/events/use-upload-event-asset'
import { lowContrast, THEME_TEXT } from '@/lib/events/contrast'
import type { EditorValues } from '@/lib/events/editor-form'
import type { EventAppearance } from '@/types/events'
import type { EventAssetKind } from '@/services/event-assets.service'

const Warning = ({ children }: { children: string }) => (
  <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {children}
  </p>
)

export const AppearanceControls = ({ eventId }: { eventId: string }) => {
  const { control, setValue, getValues } = useFormContext<EditorValues>()
  const a = useWatch({ control, name: 'appearance' })
  const upload = useUploadEventAsset(eventId)

  const set = <K extends keyof EventAppearance>(key: K, value: EventAppearance[K]) =>
    setValue('appearance', { ...getValues('appearance'), [key]: value }, { shouldDirty: true, shouldValidate: true })

  const pick = (kind: EventAssetKind) => (file: File) =>
    upload.mutate({ kind, file }, { onSuccess: (path) => set(kind === 'logo' ? 'logo_path' : 'banner_path', path) })

  return (
    <div className="space-y-4">
      <EditorSection title="Imagens">
        <AssetUpload kind="banner" path={a.banner_path} uploading={upload.isPending && upload.variables?.kind === 'banner'}
          onPick={pick('banner')} onRemove={() => set('banner_path', null)} />
        <AssetUpload kind="logo" path={a.logo_path} uploading={upload.isPending && upload.variables?.kind === 'logo'}
          onPick={pick('logo')} onRemove={() => set('logo_path', null)} />
      </EditorSection>
      <EditorSection title="Cores e tema">
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={a.theme === t} onClick={() => set('theme', t)}
              className={cn('rounded-md border px-3 py-2 text-sm transition-smooth',
                a.theme === t ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
              {t === 'light' ? 'Claro' : 'Escuro'}
            </button>
          ))}
        </div>
        <ColorField id="primary_color" label="Cor principal" value={a.primary_color} onChange={(v) => set('primary_color', v)} />
        <ColorField id="button_text_color" label="Texto do botão" value={a.button_text_color} onChange={(v) => set('button_text_color', v)} />
        <ColorField id="background_color" label="Fundo da página" value={a.background_color} onChange={(v) => set('background_color', v)} />
        {lowContrast(a.button_text_color, a.primary_color) && (
          <Warning>O texto do botão tem pouco contraste com a cor principal (abaixo de 4,5:1). Pode ficar difícil de ler.</Warning>
        )}
        {lowContrast(THEME_TEXT[a.theme], a.background_color) && (
          <Warning>O título tem pouco contraste com o fundo neste tema (abaixo de 4,5:1). Troque o fundo ou o tema.</Warning>
        )}
        <p className="text-xs text-muted-foreground">O rodapé "Feito com Veltzy" aparece em todas as páginas de evento.</p>
      </EditorSection>
    </div>
  )
}
