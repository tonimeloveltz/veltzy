import { useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PALETTE } from '@/components/shared/color-picker'
import { cn } from '@/lib/utils'
import { DEFAULT_NEW_TAG_COLOR, getReadableTextColor, isValidTagColor } from '@/lib/tag-colors'

interface TagColorPickerProps {
  value: string
  onChange: (color: string) => void
  /** Chamado ao fechar: devolve o foco ao campo de texto para o Enter continuar funcionando. */
  onClose?: () => void
}

const TagColorPicker = ({ value, onChange, onClose }: TagColorPickerProps) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Escolher cor da nova tag"
          title="Cor da nova tag"
          className="h-10 w-10 shrink-0 rounded-md border border-input p-2.5 hover:bg-accent"
        >
          <span className="block h-full w-full rounded-full" style={{ backgroundColor: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto space-y-3 p-3"
        onCloseAutoFocus={(e) => {
          if (!onClose) return
          e.preventDefault()
          onClose()
        }}
      >
        <p className="text-xs font-medium text-muted-foreground">Cor da nova tag</p>
        <div className="grid grid-cols-6 gap-1.5">
          {PALETTE.map((color) => {
            const selected = color.toLowerCase() === value.toLowerCase()
            return (
              <button
                key={color}
                type="button"
                aria-label={`Cor ${color}`}
                aria-pressed={selected}
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                  // Foca ja no clique: o onCloseAutoFocus so roda no fim da animacao de saida,
                  // e o que for digitado nesse intervalo se perdia.
                  onClose?.()
                }}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full transition-smooth',
                  selected ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:ring-2 hover:ring-border'
                )}
                style={{ backgroundColor: color }}
              >
                {selected && <Check className="h-3.5 w-3.5" style={{ color: getReadableTextColor(color) }} />}
              </button>
            )
          })}
        </div>
        <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Outra cor
          <input
            type="color"
            value={isValidTagColor(value) ? value : DEFAULT_NEW_TAG_COLOR}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
          />
        </label>
      </PopoverContent>
    </Popover>
  )
}

export { TagColorPicker }
