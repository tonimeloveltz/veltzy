import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, UserPlus, MessageSquare, ArrowRightLeft, Info, Bot, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import {
  useNotifications, useUnreadCount, useMarkNotificationAsRead, useMarkAllNotificationsAsRead,
} from '@/hooks/use-notifications'
import { useAssignDeal } from '@/hooks/use-deals'
import { useTeamMembers } from '@/hooks/use-team'
import type { Notification, NotificationType } from '@/types/database'

const typeIcons: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  new_lead: UserPlus,
  lead_assigned: ArrowRightLeft,
  new_message: MessageSquare,
  lead_transferred: ArrowRightLeft,
  system: Info,
  copilot: Bot,
  territory_conflict: AlertTriangle,
}

const TerritoryConflictAction = ({ notification, onRead }: { notification: Notification; onRead: () => void }) => {
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const assignDeal = useAssignDeal()
  const { data: members } = useTeamMembers()

  const dealId = notification.action_data?.deal_id as string | undefined

  const handleAssign = () => {
    if (!dealId || !selectedUserId) return
    assignDeal.mutate(
      { dealId, userId: selectedUserId },
      { onSuccess: () => onRead() },
    )
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
        <SelectTrigger className="h-7 text-[10px] flex-1">
          <SelectValue placeholder="Selecionar vendedor" />
        </SelectTrigger>
        <SelectContent>
          {members?.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 text-[10px] px-2"
        disabled={!selectedUserId || assignDeal.isPending}
        onClick={handleAssign}
      >
        {assignDeal.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Atribuir'}
      </Button>
    </div>
  )
}

const NotificationItem = ({ notification, onRead }: { notification: Notification; onRead: () => void }) => {
  const navigate = useNavigate()
  const Icon = typeIcons[notification.type] ?? Info
  const isConflict = notification.type === 'territory_conflict'

  const handleClick = () => {
    if (isConflict) return // handled by inline action
    if (!notification.is_read) onRead()
    if (notification.action_data?.leadId) {
      navigate(`/inbox?lead=${notification.action_data.leadId}`)
    }
  }

  const isCopilot = notification.type === 'copilot'

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-smooth hover:bg-accent hover:text-accent-foreground rounded-md',
        !notification.is_read && !isCopilot && !isConflict && 'bg-primary/5',
        !notification.is_read && isCopilot && 'bg-purple-500/10 border border-purple-500/20 rounded-lg',
        !notification.is_read && isConflict && 'bg-amber-500/10 border border-amber-500/20 rounded-lg',
      )}
    >
      <div className={cn(
        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        isCopilot
          ? 'bg-purple-500/15 text-purple-600'
          : isConflict
            ? 'bg-amber-500/15 text-amber-600'
            : !notification.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{notification.title}</p>
        {notification.body && <p className="text-[10px] text-muted-foreground truncate">{notification.body}</p>}
        {isConflict && !notification.is_read && (
          <TerritoryConflictAction notification={notification} onRead={onRead} />
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(notification.created_at)}</p>
      </div>
      {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}

const NotificationCenter = () => {
  const { data: notifications } = useNotifications()
  const unreadCount = useUnreadCount()
  const markAsRead = useMarkNotificationAsRead()
  const markAllAsRead = useMarkAllNotificationsAsRead()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white animate-pulse">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-semibold">Notificacoes</p>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead.mutate()}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas como lidas
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto scrollbar-minimal p-1">
          {!notifications?.length && (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma notificacao</p>
          )}
          {notifications?.slice(0, 20).map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRead={() => markAsRead.mutate(n.id)}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { NotificationCenter }
