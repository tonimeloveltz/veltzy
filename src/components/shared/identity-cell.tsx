import { User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface IdentityCellProps {
  /** Titulo principal ja resolvido (ex: nome do negocio ou leadDisplayName do contato). */
  title: string
  /** Subtitulo secundario (ex: contato · empresa, ou telefone). */
  subtitle?: string | null
  avatarUrl?: string | null
  className?: string
}

const initialsFrom = (text: string) =>
  text
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// Titulo "generico" (numero cru ou "Contato WhatsApp") nao gera inicial util:
// usa o icone de usuario no fallback do avatar.
const isGenericTitle = (title: string) =>
  title === 'Contato WhatsApp' || /^[\d+]/.test(title.trim())

export const IdentityCell = ({ title, subtitle, avatarUrl, className }: IdentityCellProps) => {
  const initials = initialsFrom(title)
  const useIcon = isGenericTitle(title) || initials.length === 0

  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <Avatar className="h-[30px] w-[30px] shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={title} className="h-full w-full rounded-full object-cover" />
        ) : (
          <AvatarFallback className="bg-primary/10 text-primary">
            {useIcon ? <User className="h-3.5 w-3.5" /> : <span className="text-[10px]">{initials}</span>}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-tight truncate">{title}</p>
        {subtitle && (
          <p className="text-[12px] text-muted-foreground leading-tight truncate">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
