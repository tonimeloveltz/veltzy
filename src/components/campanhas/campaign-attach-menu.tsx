import { useRef, useState } from 'react'
import { FileText, Headphones, Image as ImageIcon, Loader2, Paperclip } from 'lucide-react'
import { MEDIA_ACCEPT_AUDIO, MEDIA_ACCEPT_DOCUMENT, MEDIA_ACCEPT_VISUAL } from '@/lib/campaign-media'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface CampaignAttachMenuProps {
  onFile: (file: File) => void
  uploading: boolean
  disabled?: boolean
}

const OPTIONS = [
  { key: 'visual', label: 'Fotos e vídeos', icon: ImageIcon, accept: MEDIA_ACCEPT_VISUAL },
  { key: 'document', label: 'Documento', icon: FileText, accept: MEDIA_ACCEPT_DOCUMENT },
  { key: 'audio', label: 'Áudio', icon: Headphones, accept: MEDIA_ACCEPT_AUDIO },
] as const

/** Clipe da barra do compositor: popover com as 3 origens de anexo. */
export function CampaignAttachMenu({ onFile, uploading, disabled }: CampaignAttachMenuProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = (accept: string) => {
    setOpen(false)
    const el = inputRef.current
    if (!el) return
    el.accept = accept
    el.click()
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || uploading}
            title="Anexar"
            aria-label="Anexar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-auto p-3">
          <div className="flex gap-4">
            {OPTIONS.map(({ key, label, icon: Icon, accept }) => (
              <button
                key={key}
                type="button"
                onClick={() => pick(accept)}
                className="flex w-20 flex-col items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
