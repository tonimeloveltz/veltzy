import { useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWhatsAppTemplates } from '@/hooks/use-whatsapp-templates'
import type { TemplateComponent, WhatsAppTemplate } from '@/types/whatsapp-template'

interface TemplateSelectorPopoverProps {
  onPick: (template: WhatsAppTemplate) => void
  // Janela de 24h fechada: destaca o botao (unico caminho de envio).
  highlight?: boolean
}

function bodyPreview(t: WhatsAppTemplate): string {
  const body = Array.isArray(t.components)
    ? t.components.find((c: TemplateComponent) => c?.type === 'BODY')
    : null
  return (body?.text as string) ?? ''
}

export const TemplateSelectorPopover = ({ onPick, highlight }: TemplateSelectorPopoverProps) => {
  const { data: templates } = useWhatsAppTemplates()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Fase 1: so APPROVED e pt_BR (multi-idioma no seletor e fase futura).
  const approved = (templates ?? []).filter((t) => t.status === 'APPROVED' && t.language === 'pt_BR')
  const filtered = approved.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  if (!open) {
    return (
      <Button
        type="button"
        variant={highlight ? 'default' : 'ghost'}
        size={highlight ? 'sm' : 'icon'}
        className={highlight ? 'gap-1' : 'h-8 w-8 text-muted-foreground hover:text-foreground'}
        onClick={() => setOpen(true)}
        title="Enviar template"
      >
        <FileText className="h-4 w-4" />
        {highlight && 'Enviar template'}
      </Button>
    )
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border bg-popover p-2 shadow-lg animate-fade-in">
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar template..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-7 text-xs"
          autoFocus
        />
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-minimal space-y-1">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nenhum template aprovado. Crie em Integracoes {'>'} WhatsApp.
          </p>
        )}
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onPick(t)
              setOpen(false)
              setSearch('')
            }}
            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition-smooth"
          >
            <p className="text-xs font-medium truncate">{t.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{bodyPreview(t)}</p>
          </button>
        ))}
      </div>
      <button
        onClick={() => { setOpen(false); setSearch('') }}
        className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
      >
        Fechar
      </button>
    </div>
  )
}
