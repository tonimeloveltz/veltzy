import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isHexColor } from '@/lib/events/contrast'

interface ColorFieldProps {
  id: string
  label: string
  value: string
  onChange: (hex: string) => void
}

/** Seletor nativo + hex digitado. O hex so entra no formulario quando e valido. */
export const ColorField = ({ id, label, value, onChange }: ColorFieldProps) => {
  const [text, setText] = useState(value)
  // Cor mudou por fora (seletor, reset do formulario): o texto acompanha.
  const [prev, setPrev] = useState(value)
  if (value !== prev) { setPrev(value); setText(value) }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} (seletor)`} value={isHexColor(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1" />
        <Input id={id} value={text} maxLength={7} spellCheck={false} className="font-mono uppercase"
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            setText(v)
            if (isHexColor(v)) onChange(v.toUpperCase())
          }} />
      </div>
      {!isHexColor(text) && <p className="text-xs text-destructive">Use o formato #RRGGBB</p>}
    </div>
  )
}
