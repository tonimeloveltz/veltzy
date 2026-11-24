import { useFormContext, useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EditorField } from '@/components/events/editor/editor-field'
import { useSlugAvailability, type SlugState } from '@/hooks/events/use-slug-availability'
import type { EditorValues } from '@/lib/events/editor-form'
import type { Event } from '@/types/events'

const STATE_TEXT: Record<Exclude<SlugState, 'idle'>, { text: string; className: string }> = {
  checking: { text: 'Verificando...', className: 'text-muted-foreground' },
  available: { text: 'Disponível', className: 'text-primary' },
  taken: { text: 'Em uso por outro evento', className: 'text-destructive' },
  invalid: { text: 'Só letras minúsculas, números e hífens (3 a 80)', className: 'text-destructive' },
}

interface SlugFieldProps {
  event: Event
  onManualEdit: () => void
}

export const SlugField = ({ event, onManualEdit }: SlugFieldProps) => {
  const { register, control } = useFormContext<EditorValues>()
  const slug = useWatch({ control, name: 'slug' })
  const state = useSlugAvailability(slug, event.id, event.slug)
  const live = event.status === 'published' || event.status === 'closed'
  const changed = slug !== event.slug

  return (
    <EditorField label="Link da página" htmlFor="slug">
      <div className="flex min-w-0 items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
        <span className="hidden shrink-0 pl-3 text-sm text-muted-foreground sm:inline">{window.location.host}/e/</span>
        <Input
          id="slug"
          {...register('slug', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '-')
              onManualEdit()
            },
          })}
          className="border-0 pl-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {state !== 'idle' && (
        <p className={cn('text-xs', STATE_TEXT[state].className)}>{STATE_TEXT[state].text}</p>
      )}
      {live && changed && (
        <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
          O evento está publicado: ao salvar, o link antigo para de funcionar para quem já recebeu.
        </p>
      )}
    </EditorField>
  )
}
