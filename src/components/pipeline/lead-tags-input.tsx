import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { TagBadge } from '@/components/shared/tag-badge'
import { TagColorPicker } from '@/components/pipeline/tag-color-picker'
import { useLeadTags } from '@/hooks/use-lead-tags'
import { useCreateLeadTag } from '@/hooks/use-create-lead-tag'
import { DEFAULT_NEW_TAG_COLOR } from '@/lib/tag-colors'

interface LeadTagsInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /**
   * false = so filtra (publico da campanha): mostra as cores, mas tag digitada
   * nao entra no catalogo e o seletor de cor some.
   */
  allowCreate?: boolean
}

const LeadTagsInput = ({ value, onChange, allowCreate = true }: LeadTagsInputProps) => {
  const [input, setInput] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_NEW_TAG_COLOR)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { getTagColor } = useLeadTags()
  const createTag = useCreateLeadTag()

  const addTag = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
      // Tag que ja existe no catalogo mantem a cor dela.
      if (allowCreate && !getTagColor(tag)) createTag.mutate({ name: tag, color: newTagColor })
    }
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Ir para o seletor de cor nao confirma a tag: a cor ainda vai ser escolhida.
    if (e.relatedTarget && containerRef.current?.contains(e.relatedTarget)) return
    addTag()
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <TagBadge key={tag} name={tag} color={getTagColor(tag)} onRemove={() => removeTag(tag)} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          placeholder="Digite e pressione Enter"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        {allowCreate && (
          <TagColorPicker
            value={newTagColor}
            onChange={setNewTagColor}
            onClose={() => inputRef.current?.focus()}
          />
        )}
      </div>
    </div>
  )
}

export { LeadTagsInput }
