import { useRef, useState } from 'react'
import { FileText, Loader2, Music, Paperclip, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { removeCampaignMedia, uploadCampaignMedia } from '@/services/campaigns.service'
import { MEDIA_ACCEPT, MEDIA_MAX_BYTES, mediaTypeFromMime } from '@/lib/campaign-media'
import { Button } from '@/components/ui/button'
import type { CampaignMedia } from '@/lib/campaign-draft'

interface CampaignMediaInputProps {
  value: CampaignMedia | null
  onChange: (media: CampaignMedia | null) => void
  /** Arquivo já salvo na campanha (edição): só sai do storage quando a edição for salva. */
  savedPath: string | null
  expired: boolean
  hasText: boolean
}

const TypeIcon = ({ type }: { type: CampaignMedia['type'] }) => {
  const Icon = type === 'video' ? Video : type === 'audio' ? Music : FileText
  return <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
}

export function CampaignMediaInput({ value, onChange, savedPath, expired, hasText }: CampaignMediaInputProps) {
  const companyId = useAuthStore((s) => s.company?.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Arquivo enviado nesta edição e descartado: apaga já (o salvo só sai ao salvar).
  const discard = (media: CampaignMedia | null) => {
    if (media && media.path !== savedPath) removeCampaignMedia(media.path).catch(() => { /* expurgo não cobre; segue */ })
  }

  const handleFile = async (file: File) => {
    setError(null)
    if (file.size > MEDIA_MAX_BYTES) { setError('Arquivo maior que 16 MB.'); return }
    if (!companyId) return
    setUploading(true)
    try {
      const { url, path } = await uploadCampaignMedia(companyId, file)
      discard(value)
      onChange({ url, path, name: file.name, type: mediaTypeFromMime(file.type) })
    } catch {
      toast.error('Não foi possível enviar o arquivo. Tente de novo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-md border p-2">
          {value.type === 'image'
            ? <img src={value.url} alt={value.name} className="h-12 w-12 shrink-0 rounded object-cover" />
            : <TypeIcon type={value.type} />}
          <span className="min-w-0 flex-1 truncate text-sm">{value.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            Trocar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { discard(value); onChange(null) }} disabled={uploading}>
            <X className="h-4 w-4" /> Remover
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          {uploading ? 'Enviando arquivo…' : 'Anexar'}
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {expired && !value && <p className="text-xs text-destructive">O anexo expirou. Anexe de novo.</p>}
      {value?.type === 'audio' && hasText && (
        <p className="text-xs text-muted-foreground">O texto vai em uma mensagem e o áudio logo depois.</p>
      )}
      <p className="text-xs text-muted-foreground">Imagem, vídeo, áudio ou arquivo de até 16 MB.</p>
    </div>
  )
}
