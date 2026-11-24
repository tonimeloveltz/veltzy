import { Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/events/copy-event-link'

interface CopyFieldProps {
  value: string
  label?: string
  openable?: boolean
}

/** Link em linha unica com Copiar (e Abrir, quando e uma URL). */
export const CopyField = ({ value, label = 'Link copiado.', openable }: CopyFieldProps) => (
  <div className="flex min-w-0 items-center gap-2">
    <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-xs">{value}</code>
    <Button type="button" variant="outline" size="sm" onClick={() => copyText(value, label)}>
      <Copy className="h-4 w-4" /> Copiar
    </Button>
    {openable && (
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" asChild aria-label="Abrir">
        <a href={value} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
      </Button>
    )}
  </div>
)
