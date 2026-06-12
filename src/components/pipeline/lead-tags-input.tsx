import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface LeadTagsInputProps {
  value: string[]
  onChange: (tags: string[]) => void
}

const LeadTagsInput = ({ value, onChange }: LeadTagsInputProps) => {
  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
          >
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        placeholder="Digite e pressione Enter"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
      />
    </div>
  )
}

export { LeadTagsInput }
