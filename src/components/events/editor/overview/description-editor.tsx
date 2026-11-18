import { useRef, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Bold, Heading, Italic, Link2, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { EventMarkdown } from '@/components/events/event-markdown'
import { applyMarkdown, type MarkdownAction } from '@/lib/events/markdown-toolbar'
import type { EditorValues } from '@/lib/events/editor-form'

const ACTIONS: Array<{ action: MarkdownAction; label: string; icon: typeof Bold }> = [
  { action: 'bold', label: 'Negrito', icon: Bold },
  { action: 'italic', label: 'Itálico', icon: Italic },
  { action: 'heading', label: 'Título', icon: Heading },
  { action: 'list', label: 'Lista', icon: List },
  { action: 'link', label: 'Link', icon: Link2 },
]

/** Textarea com barra que insere Markdown (D10) e aba de pre-visualizacao com o renderer da pagina publica. */
export const DescriptionEditor = () => {
  const { register, setValue, control } = useFormContext<EditorValues>()
  const value = useWatch({ control, name: 'description' })
  const [preview, setPreview] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const { ref, ...field } = register('description')

  const apply = (action: MarkdownAction) => {
    const el = areaRef.current
    if (!el) return
    const edit = applyMarkdown(el.value, el.selectionStart, el.selectionEnd, action)
    setValue('description', edit.text, { shouldDirty: true })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd)
    })
  }

  return (
    <div className="rounded-md border border-input">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        {ACTIONS.map(({ action, label, icon: Icon }) => (
          <Tooltip key={action}>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={label}
                disabled={preview} onClick={() => apply(action)}>
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs">
          {(['Escrever', 'Pré-visualizar'] as const).map((label, i) => (
            <button key={label} type="button" onClick={() => setPreview(i === 1)}
              className={cn('rounded px-2 py-1', preview === (i === 1) ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {preview ? (
        <div className="min-h-[180px] px-3 py-2">
          {value.trim() ? <EventMarkdown content={value} /> : <p className="text-sm text-muted-foreground">Nada para mostrar ainda.</p>}
        </div>
      ) : (
        <Textarea
          id="description"
          {...field}
          ref={(el) => { ref(el); areaRef.current = el }}
          rows={8}
          placeholder="Conte o que vai acontecer, para quem é e por que vale a pena ir."
          className="min-h-[180px] rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      )}
    </div>
  )
}
