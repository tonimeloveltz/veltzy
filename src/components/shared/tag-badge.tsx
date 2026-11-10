import { X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { getReadableTextColor, isValidTagColor } from '@/lib/tag-colors'

const tagBadgeVariants = cva('inline-flex items-center gap-1 rounded-full font-medium', {
  variants: {
    size: {
      sm: 'px-1.5 py-0.5 text-[10px]',
      md: 'px-2.5 py-0.5 text-xs',
    },
  },
  defaultVariants: { size: 'md' },
})

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
  const style = hasColor ? { backgroundColor: color, color: getReadableTextColor(color) } : undefined

  return (
    <span
      className={cn(tagBadgeVariants({ size }), !hasColor && fallbackBySize[size ?? 'md'], className)}
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
