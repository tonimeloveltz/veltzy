import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import {
  CheckSquare, MessageCircle, Phone, Video, MoreVertical,
  Pencil, Check, Trash2, Calendar, GripVertical,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useCompleteTask, useDeleteTask } from '@/hooks/use-tasks'
import type { TaskWithRelations, TaskType } from '@/types/database'

interface TaskCardProps {
  task: TaskWithRelations
  onEdit: (task: TaskWithRelations) => void
  onLeadClick?: (leadId: string) => void
}

const typeConfig: Record<TaskType, { icon: typeof CheckSquare; label: string }> = {
  todo: { icon: CheckSquare, label: 'Tarefa' },
  followup: { icon: MessageCircle, label: 'Follow-up' },
  call: { icon: Phone, label: 'Ligacao' },
  meeting: { icon: Video, label: 'Reuniao' },
}

const getDueStatus = (dueDate: string | null): 'overdue' | 'today' | 'normal' | null => {
  if (!dueDate) return null
  const now = new Date()
  const due = new Date(dueDate)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  if (dueDay < today) return 'overdue'
  if (dueDay.getTime() === today.getTime()) return 'today'
  return 'normal'
}

const TaskCard = ({ task, onEdit, onLeadClick }: TaskCardProps) => {
  const completeTask = useCompleteTask()
  const deleteTask = useDeleteTask()
  const config = typeConfig[task.type]
  const Icon = config.icon
  const dueStatus = getDueStatus(task.due_date)

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id, data: { task } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation()
    completeTask.mutate(task.id)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Remover esta tarefa?')) {
      deleteTask.mutate(task.id)
    }
  }

  const assigneeInitials = task.profiles?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'glass-card rounded-lg p-3 animate-fade-in border-l-2',
        isDragging && 'opacity-50 scale-105 shadow-xl z-50',
        task.status === 'done' && 'opacity-60',
        dueStatus === 'overdue' && 'border-l-red-500',
        dueStatus === 'today' && 'border-l-yellow-500',
        dueStatus === 'normal' && 'border-l-transparent',
        !task.due_date && 'border-l-transparent',
      )}
      onClick={() => onEdit(task)}
    >
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground transition-smooth shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10" title={config.label}>
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
              {task.title}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground hover:bg-accent transition-smooth shrink-0"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(task)}>
                <Pencil className="h-4 w-4" />
                Editar
              </DropdownMenuItem>
              {task.status !== 'done' && (
                <DropdownMenuItem onClick={handleComplete}>
                  <Check className="h-4 w-4" />
                  Marcar como feita
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {task.leads && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onLeadClick?.(task.leads!.id)
                }}
                className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-smooth"
              >
                {task.leads.name || task.leads.phone}
              </button>
            )}
            {task.due_date && (
              <span className={cn(
                'flex items-center gap-0.5 text-[10px] shrink-0',
                dueStatus === 'overdue' && 'text-red-500',
                dueStatus === 'today' && 'text-yellow-600',
                dueStatus === 'normal' && 'text-muted-foreground',
              )}>
                <Calendar className="h-2.5 w-2.5" />
                {new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>

          {assigneeInitials && (
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {assigneeInitials}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )
}

export { TaskCard }
