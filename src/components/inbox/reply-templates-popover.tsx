import { useState } from 'react'
import { Search, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useReplyTemplates } from '@/hooks/use-reply-templates'

interface ReplyTemplatesPopoverProps {
  onSelect: (content: string) => void
}

const ReplyTemplatesPopover = ({ onSelect }: ReplyTemplatesPopoverProps) => {
  const { data: templates } = useReplyTemplates()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = templates?.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase())
  )

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        title="Templates"
      >
        <FileText className="h-4 w-4" />
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
        {filtered?.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum template encontrado</p>
        )}
        {filtered?.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onSelect(t.content)
              setOpen(false)
              setSearch('')
            }}
            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition-smooth"
          >
            <p className="text-xs font-medium truncate">{t.title}</p>
            <p className="text-[10px] text-muted-foreground truncate">{t.content}</p>
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

export { ReplyTemplatesPopover }
