import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface EditorFieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: ReactNode
  optional?: boolean
  className?: string
  children: ReactNode
}

/** Rotulo, controle, dica e erro de um campo do editor. */
export const EditorField = ({ label, htmlFor, error, hint, optional, className, children }: EditorFieldProps) => (
  <div className={cn('space-y-1.5', className)}>
    <Label htmlFor={htmlFor} className="text-sm">
      {label}
      {optional && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}
    </Label>
    {children}
    {error ? (
      <p className="text-xs text-destructive">{error}</p>
    ) : (
      hint && <p className="text-xs text-muted-foreground">{hint}</p>
    )}
  </div>
)
