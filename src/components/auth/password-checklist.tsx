import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PASSWORD_RULES } from '@/lib/password-rules'

interface PasswordChecklistProps {
  senha: string
}

const PasswordChecklist = ({ senha }: PasswordChecklistProps) => {
  return (
    <ul className="space-y-1" aria-label="Requisitos da senha">
      {PASSWORD_RULES.map((rule) => {
        const cumprido = rule.test(senha)
        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              cumprido ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{rule.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

export { PasswordChecklist }
