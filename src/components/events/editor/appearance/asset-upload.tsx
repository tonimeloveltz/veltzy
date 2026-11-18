import { useRef } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { eventAssetUrl, type EventAssetKind } from '@/services/event-assets.service'

interface AssetUploadProps {
  kind: EventAssetKind
  path: string | null
  uploading: boolean
  onPick: (file: File) => void
  onRemove: () => void
}

const COPY: Record<EventAssetKind, { label: string; hint: string }> = {
  logo: { label: 'Logo', hint: 'JPG, PNG ou WebP, até 2 MB. Quadrado funciona melhor.' },
  banner: { label: 'Banner', hint: 'JPG, PNG ou WebP, até 5 MB. Sugestão: 1600 x 530. O corte é pelo centro.' },
}

export const AssetUpload = ({ kind, path, uploading, onPick, onRemove }: AssetUploadProps) => {
  const input = useRef<HTMLInputElement>(null)
  const url = eventAssetUrl(path)
  return (
    <div className="space-y-2">
      <Label>{COPY[kind].label}</Label>
      <div className={cn('flex items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/40',
        kind === 'logo' ? 'h-20 w-20' : 'aspect-[3/1] w-full')}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover object-center" />
          : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />} {url ? 'Trocar' : 'Enviar imagem'}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> Remover
          </Button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
      </div>
      <p className="text-xs text-muted-foreground">{COPY[kind].hint}</p>
    </div>
  )
}
