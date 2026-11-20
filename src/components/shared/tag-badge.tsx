import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { getTagStyleVars, isValidTagColor } from '@/lib/tag-colors'

const tagBadgeVariants = cva('inline-flex items-center gap-1 rounded-full font-medium', {
  variants: {
    size: {
      sm: 'px-1.5 py-0.5 text-[10px]',
      md: 'px-2.5 py-0.5 text-xs',
    },
  },
  defaultVariants: { size: 'md' },
})

// Cor cadastrada: fundo translucido da cor + texto da propria cor com contraste AA
// (vars de getTagStyleVars; dark: troca para as vars do modo escuro). Sem borda.
const coloredClasses = 'bg-[var(--tag-bg)] text-[color:var(--tag-fg)] dark:bg-[var(--tag-bg-dark)] dark:text-[color:var(--tag-fg-dark)]'

// Sem cor cadastrada: mantem o estilo de antes da feature, com tokens do tema.
const fallbackBySize = {
  sm: 'bg-muted text-muted-foreground',
  md: 'bg-primary/10 text-primary',
} as const

interface TagBadgeProps extends VariantProps<typeof tagBadgeVariants> {
  name: string
  color?: string
  onRemove?: () => void
  className?: string
}

const TagBadge = ({ name, color, size, onRemove, className }: TagBadgeProps) => {
  const hasColor = !!color && isValidTagColor(color)
  const style = hasColor ? (getTagStyleVars(color) as CSSProperties) : undefined

  return (
    <span
      className={cn(tagBadgeVariants({ size }), hasColor ? coloredClasses : fallbackBySize[size ?? 'md'], className)}
      style={style}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover tag ${name}`}
          className="opacity-70 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export { TagBadge }
