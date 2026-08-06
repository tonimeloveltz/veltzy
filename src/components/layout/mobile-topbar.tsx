import { Menu } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { NotificationCenter } from '@/components/shared/notification-center'

interface MobileTopbarProps {
  onMenuClick: () => void
}

const MobileTopbar = ({ onMenuClick }: MobileTopbarProps) => {
  const { company } = useAuth()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 lg:hidden">
      {/* h-11 w-11 (44px) em vez do size="icon" do Button, que da 36px. */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-smooth hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          {company?.name?.[0]?.toUpperCase() ?? 'V'}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-primary leading-tight">Veltzy</span>
          <span className="truncate text-xs text-muted-foreground leading-tight">
            {company?.name ?? 'CRM'}
          </span>
        </div>
      </div>

      <NotificationCenter />
    </header>
  )
}

export { MobileTopbar }
