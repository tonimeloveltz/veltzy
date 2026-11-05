import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Music, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { removeCampaignMedia, uploadCampaignMedia } from '@/services/campaigns.service'
import { MEDIA_MAX_BYTES, mediaTypeFromMime } from '@/lib/campaign-media'
import { FREE_VARIABLES } from '@/lib/campaign-preview'
import { AudioRecorder } from '@/components/inbox/audio-recorder'
import { CampaignAttachMenu } from '@/components/campanhas/campaign-attach-menu'
import type { CampaignMedia } from '@/lib/campaign-draft'

export interface ComposerMediaProps {
  value: CampaignMedia | null
  onChange: (media: CampaignMedia | null) => void
  /** Arquivo já salvo na campanha (edição): só sai do storage quando a edição for salva. */
  savedPath: string | null
  expired: boolean
}

interface CampaignComposerProps {
  body: string
  onBodyChange: (body: string) => void
  /** Ausente = sem anexo (número oficial ou sem provider). */
  media?: ComposerMediaProps
}

const MAX_TEXTAREA_PX = 240

const MediaChip = ({ media, onRemove, disabled }: { media: CampaignMedia; onRemove: () => void; disabled: boolean }) => {
  const Icon = media.type === 'video' ? Video : media.type === 'audio' ? Music : FileText
  return (
    <div className="flex max-w-full items-center gap-2 self-start rounded-lg border bg-muted/40 py-1 pl-1 pr-2">
      {media.type === 'image'
        ? <img src={media.url} alt={media.name} className="h-9 w-9 shrink-0 rounded object-cover" />
        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-background"><Icon className="h-4 w-4 text-muted-foreground" /></span>}
      <span className="min-w-0 truncate text-sm">{media.name}</span>
      <button type="button" onClick={onRemove} disabled={disabled} aria-label="Remover anexo" className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Barra de mensagem no estilo do WhatsApp: clipe, texto, microfone e variáveis. */
export function CampaignComposer({ body, onBodyChange, media }: CampaignComposerProps) {
  const companyId = useAuthStore((s) => s.company?.id)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`
  }, [])
  useEffect(adjustHeight, [body, recording, adjustHeight])

  // Arquivo enviado nesta edição e descartado: apaga já (o salvo só sai ao salvar).
  const discard = (m: CampaignMedia | null) => {
    if (m && m.path !== media?.savedPath) removeCampaignMedia(m.path).catch(() => { /* expurgo não cobre; segue */ })
  }

  const attach = async (file: File) => {
    if (!media) return
    setError(null)
    if (file.size > MEDIA_MAX_BYTES) { setError('Arquivo maior que 16 MB.'); return }
    if (!companyId) return
    setUploading(true)
    try {
      const { url, path } = await uploadCampaignMedia(companyId, file)
      discard(media.value)
      media.onChange({ url, path, name: file.name, type: mediaTypeFromMime(file.type), size: file.size })
    } catch {
      toast.error('Não foi possível enviar o arquivo. Tente de novo.')
    } finally {
      setUploading(false)
    }
  }

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`
    const el = textareaRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    onBodyChange(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const at = start + token.length
      el.setSelectionRange(at, at)
    })
  }

  const current = media?.value ?? null
  const hasText = body.trim() !== ''

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
        {current && (
          <MediaChip media={current} disabled={uploading} onRemove={() => { discard(current); media?.onChange(null) }} />
        )}
        <div className="flex items-end gap-1">
          {media && !recording && <CampaignAttachMenu onFile={attach} uploading={uploading} />}
          {!recording && (
            <textarea
              ref={textareaRef}
              id="camp-body"
              aria-label="Mensagem"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={3}
              placeholder={current ? 'Adicione uma legenda (opcional)' : 'Escreva a mensagem'}
              className="min-h-[72px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
            />
          )}
          {media && (
            <AudioRecorder
              onRecordingChange={setRecording}
              onSend={attach}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Inserir:</span>
        {FREE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => insertVariable(v.key)}
            className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground transition-smooth hover:border-primary hover:bg-primary/10 hover:text-primary"
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {media?.expired && !current && <p className="text-xs text-destructive">O anexo expirou. Anexe de novo.</p>}
      {current?.type === 'audio' && hasText && (
        <p className="text-xs text-muted-foreground">O texto vai em uma mensagem e o áudio logo depois.</p>
      )}
      {media && <p className="text-xs text-muted-foreground">Imagem, vídeo, áudio ou arquivo de até 16 MB.</p>}
    </div>
  )
}
