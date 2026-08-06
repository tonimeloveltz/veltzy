import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, CheckSquare, MessageCircle, Phone, Video, Trash2,
  Bell, Mail, X, Pencil, Save,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useUpdateTask, useDeleteTask } from '@/hooks/use-tasks'
import { useTaskReminders, useUpdateReminder, useCancelReminder } from '@/hooks/use-task-reminders'
import { useTeamMembers } from '@/hooks/use-team'
import type { TaskWithRelations, TaskType, TaskStatus, TaskReminder } from '@/types/database'

const schema = z.object({
  title: z.string().min(1, 'Titulo obrigatorio'),
  type: z.enum(['todo', 'followup', 'call', 'meeting']),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']),
  due_date: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface EditTaskModalProps {
  task: TaskWithRelations | null
  open: boolean
  onClose: () => void
}

const typeOptions: Array<{ value: TaskType; label: string; icon: typeof CheckSquare }> = [
  { value: 'todo', label: 'Tarefa', icon: CheckSquare },
  { value: 'followup', label: 'Follow-up', icon: MessageCircle },
  { value: 'call', label: 'Ligacao', icon: Phone },
  { value: 'meeting', label: 'Reuniao', icon: Video },
]

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Feito' },
  { value: 'cancelled', label: 'Cancelada' },
]

const EditTaskModal = ({ task, open, onClose }: EditTaskModalProps) => {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const { data: members } = useTeamMembers()

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        type: task.type,
        assigned_to: task.assigned_to ?? '',
        status: task.status,
        due_date: task.due_date ? task.due_date.slice(0, 16) : '',
        description: task.description ?? '',
      })
    }
  }, [task, reset])

  const onSubmit = async (values: FormValues) => {
    if (!task) return
    await updateTask.mutateAsync({
      taskId: task.id,
      data: {
        title: values.title,
        type: values.type as TaskType,
        assigned_to: values.assigned_to || null,
        status: values.status as TaskStatus,
        due_date: values.due_date || null,
        description: values.description || null,
      },
    })
    onClose()
  }

  const handleDelete = async () => {
    if (!task) return
    if (!confirm('Remover esta tarefa?')) return
    await deleteTask.mutateAsync(task.id)
    onClose()
  }

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Tarefa</DialogTitle>
          <DialogDescription>Atualize os dados da tarefa</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Titulo *</Label>
            <Input {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {typeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-smooth',
                        field.value === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Responsavel</Label>
            <Controller
              control={control}
              name="assigned_to"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {members?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Data de vencimento</Label>
            <Input type="datetime-local" {...register('due_date')} />
          </div>

          <div className="space-y-2">
            <Label>Descricao</Label>
            <textarea
              {...register('description')}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
            />
          </div>

          {task.leads && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                Lead: <span className="font-medium text-foreground">{task.leads.name || task.leads.phone}</span>
              </p>
            </div>
          )}

          {task.type === 'meeting' && (
            <RemindersList taskId={task.id} />
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={deleteTask.isPending}>
              <Trash2 className="mr-1 h-4 w-4" />
              Remover
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={updateTask.isPending}>
                {updateTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const channelIcon = (ch: string) => {
  if (ch === 'email') return <Mail className="h-3 w-3" />
  if (ch === 'both') return <><MessageCircle className="h-3 w-3" /><Mail className="h-3 w-3" /></>
  return <MessageCircle className="h-3 w-3" />
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-yellow-500/15 text-yellow-600' },
  sent: { label: 'Enviado', cls: 'bg-emerald-500/15 text-emerald-600' },
  edited: { label: 'Editado', cls: 'bg-blue-500/15 text-blue-600' },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground' },
  failed: { label: 'Falhou', cls: 'bg-red-500/15 text-red-500' },
}

const RemindersList = ({ taskId }: { taskId: string }) => {
  const { data: reminders, isLoading } = useTaskReminders(taskId)
  const updateReminder = useUpdateReminder()
  const cancelRem = useCancelReminder()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin mx-auto" />
  if (!reminders?.length) return null

  const canEdit = (r: TaskReminder) =>
    (r.status === 'pending' || r.status === 'edited') &&
    new Date(r.scheduled_at).getTime() > Date.now() + 30 * 60 * 1000

  const handleSaveEdit = async (id: string) => {
    await updateReminder.mutateAsync({ reminderId: id, content: editContent })
    setEditingId(null)
  }

  const handleCancel = async (id: string) => {
    if (confirm('Cancelar este lembrete?')) {
      await cancelRem.mutateAsync(id)
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lembretes agendados</p>
      </div>
      {reminders.map((r) => {
        const badge = statusBadge[r.status] ?? statusBadge.pending
        const isEditing = editingId === r.id
        return (
          <div key={r.id} className="rounded-lg border border-border/30 p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-muted-foreground">{channelIcon(r.channel)}</div>
              <span className="text-[10px] text-muted-foreground flex-1">
                {new Date(r.scheduled_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium', badge.cls)}>
                {badge.label}
              </span>
            </div>

            {isEditing ? (
              <div className="space-y-1.5">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs input-clean"
                />
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSaveEdit(r.id)} disabled={updateReminder.isPending}>
                    <Save className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground line-clamp-2">{r.content}</p>
                {canEdit(r) && (
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => { setEditingId(r.id); setEditContent(r.content) }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleCancel(r.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { EditTaskModal }
