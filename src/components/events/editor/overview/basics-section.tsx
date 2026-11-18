import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { EditorField } from '@/components/events/editor/editor-field'
import { EditorSection } from '@/components/events/editor/editor-section'
import { DescriptionEditor } from '@/components/events/editor/overview/description-editor'
import { SlugField } from '@/components/events/editor/overview/slug-field'
import { slugify } from '@/lib/events/slug'
import type { EditorValues } from '@/lib/events/editor-form'
import type { Event } from '@/types/events'

interface BasicsSectionProps {
  event: Event
}

export const BasicsSection = ({ event }: BasicsSectionProps) => {
  const { register, setValue, getValues, formState: { errors } } = useFormContext<EditorValues>()
  // Rascunho com slug ainda derivado do titulo: o slug acompanha o titulo ate alguem edita-lo.
  const [autoSlug, setAutoSlug] = useState(() => {
    const { title, slug } = getValues()
    const base = slugify(title)
    return event.status === 'draft' && base !== '' && slug.startsWith(base)
  })

  return (
    <EditorSection title="Informações básicas">
      <EditorField label="Nome do evento" htmlFor="title" error={errors.title?.message}>
        <Input
          id="title"
          maxLength={120}
          {...register('title', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const next = slugify(e.target.value)
              if (autoSlug && next.length >= 3) setValue('slug', next, { shouldDirty: true, shouldValidate: true })
            },
          })}
        />
      </EditorField>
      <SlugField event={event} onManualEdit={() => setAutoSlug(false)} />
      <EditorField label="Categoria" htmlFor="category" optional error={errors.category?.message}>
        <Input id="category" placeholder="Ex.: Workshop, Palestra, Meetup" {...register('category')} />
      </EditorField>
      <EditorField label="Descrição" htmlFor="description" optional error={errors.description?.message}>
        <DescriptionEditor />
      </EditorField>
    </EditorSection>
  )
}
