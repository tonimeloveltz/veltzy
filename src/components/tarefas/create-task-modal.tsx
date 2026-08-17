import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, CheckSquare, MessageCircle, Phone, Video, Search, Sparkles,
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
import { useQuery } from '@tanstack/react-query'
import { useCreateTask } from '@/hooks/use-tasks'
import { useCreateReminders } from '@/hooks/use-task-reminders'
import { useTeamMembers } from '@/hooks/use-team'
import { useAuthStore } from '@/stores/auth.store'
import { veltzy, supabase } from '@/lib/supabase'
import { buildMeetingReminders } from '@/services/task-reminders.service'
import type { TaskType, Task } from '@/types/database'

const useLeadsSimple = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['leads-simple', companyId],
    queryFn: async () => {
      const { data, error } = await veltzy()
        .from('leads')
        .select('id, name, phone, email')
        .eq('company_id', companyId!)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as Array<{ id: string; name: string | null; phone: string; email: string | null }>
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
}

const schema = z.object({
  title: z.string().min(1, 'Titulo obrigatorio'),
  type: z.enum(['todo', 'followup', 'call', 'meeting']),
  lead_id: z.string().uuid().optional().or(z.literal('')),
  assigned_to: z.string().uuid().optional().or(z.literal('')),
  due_date: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  // Meeting fields
  meeting_date: z.string().optional().or(z.literal('')),
  meeting_duration: z.number().optional(),
  meeting_link: z.string().optional().or(z.literal('')),
  meeting_lead_email: z.string().email().optional().or(z.literal('')),
  meeting_notes: z.string().optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  defaultLeadId?: string | null
  defaultTitle?: string
}

const typeOptions: Array<{ value: TaskType; label: string; icon: typeof CheckSquare }> = [
  { value: 'todo', label: 'Tarefa', icon: CheckSquare },
  { value: 'followup', label: 'Follow-up', icon: MessageCircle },
  { value: 'call', label: 'Ligacao', icon: Phone },
  { value: 'meeting', label: 'Reuniao', icon: Video },
]

const durationOptions = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2 horas' },
]

interface AIReminders {
  reminder_48h: string
  reminder_2h: string
  reminder_15min: string
}

const CreateTaskModal = ({ open, onClose, defaultLeadId, defaultTitle }: CreateTaskModalProps) => {
  const profile = useAuthStore((s) => s.profile)
  const createTask = useCreateTask()
  const createReminders = useCreateReminders()
  const { data: members } = useTeamMembers()
  const { data: allLeads } = useLeadsSimple()
  const [leadSearch, setLeadSearch] = useState('')

  // Step 2: reminders
  const [step, setStep] = useState<'form' | 'reminders'>('form')
  const [createdTask, setCreatedTask] = useState<Task | null>(null)
  const [, setAiReminders] = useState<AIReminders | null>(null)
  const [editableReminders, setEditableReminders] = useState<AIReminders | null>(null)
  const [generatingAI, setGeneratingAI] = useState(false)

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: defaultTitle ?? '',
      type: 'todo',
      lead_id: defaultLeadId ?? '',
      assigned_to: profile?.id ?? '',
      meeting_duration: 60,
    },
  })

  const watchType = watch('type')
  const watchLeadId = watch('lead_id')

  // Auto-fill email when lead changes
  useEffect(() => {
    if (watchLeadId && allLeads) {
      const lead = allLeads.find((l) => l.id === watchLeadId)
      if (lead?.email) setValue('meeting_lead_email', lead.email)
    }
  }, [watchLeadId, allLeads, setValue])

  useEffect(() => {
    if (open) {
      setStep('form')
      setCreatedTask(null)
      setAiReminders(null)
      setEditableReminders(null)
      reset({
        title: defaultTitle ?? '',
        type: 'todo',
        lead_id: defaultLeadId ?? '',
        assigned_to: profile?.id ?? '',
        due_date: '',
        description: '',
        meeting_date: '',
        meeting_duration: 60,
        meeting_link: '',
        meeting_lead_email: '',
        meeting_notes: '',
      })
      setLeadSearch('')
    }
  }, [open, defaultLeadId, profile?.id, reset])

  const generateReminders = async (task: Task, leadName: string) => {
    setGeneratingAI(true)
    try {
      const meetingDateFmt = task.meeting_date
        ? new Date(task.meeting_date).toLocaleString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
        : 'data nao definida'

      const { data, error } = await supabase.functions.invoke('sdr-ai', {
        body: {
          mode: 'meeting-reminders',
          leadName: leadName || 'o cliente',
          meetingDate: meetingDateFmt,
          meetingLink: task.meeting_link || '',
        },
      })

      if (error) throw error

      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      const reminders: AIReminders = {
        reminder_48h: parsed.reminder_48h ?? `Ola ${leadName}! Lembrete: temos uma reuniao agendada para ${meetingDateFmt}. Nos vemos la!`,
        reminder_2h: parsed.reminder_2h ?? `Ola ${leadName}! Nossa reuniao comeca em 2 horas. ${task.meeting_link ? `Link: ${task.meeting_link}` : 'Ate logo!'}`,
        reminder_15min: parsed.reminder_15min ?? `${leadName}, nossa reuniao comeca em 15 minutos! ${task.meeting_link ? task.meeting_link : ''}`,
      }
      setAiReminders(reminders)
      setEditableReminders(reminders)
    } catch {
      // Fallback: mensagens genericas
      const leadDisplay = leadName || 'o cliente'
      const fallback: AIReminders = {
        reminder_48h: `Ola ${leadDisplay}! Lembrete: temos uma reuniao agendada. Nos vemos la!`,
        reminder_2h: `Ola ${leadDisplay}! Nossa reuniao comeca em 2 horas.`,
        reminder_15min: `${leadDisplay}, nossa reuniao comeca em 15 minutos!`,
      }
      setAiReminders(fallback)
      setEditableReminders(fallback)
    } finally {
      setGeneratingAI(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    const isMeeting = values.type === 'meeting'

    const task = await createTask.mutateAsync({
      title: values.title,
      type: values.type as TaskType,
      lead_id: values.lead_id && values.lead_id !== 'none' ? values.lead_id : null,
      assigned_to: values.assigned_to || profile?.id || null,
      created_by: profile?.id ?? null,
      due_date: isMeeting ? (values.meeting_date || null) : (values.due_date || null),
      description: isMeeting
        ? [values.description, values.meeting_notes].filter(Boolean).join('\n\n') || null
        : (values.description || null),
      ...(isMeeting && {
        meeting_date: values.meeting_date || null,
        meeting_duration: values.meeting_duration || null,
        meeting_link: values.meeting_link || null,
        meeting_lead_email: values.meeting_lead_email || null,
      }),
    })

    if (isMeeting && values.meeting_date) {
      setCreatedTask(task)
      setStep('reminders')
      const lead = allLeads?.find((l) => l.id === values.lead_id)
      await generateReminders(task, lead?.name || lead?.phone || '')
    } else {
      reset()
      onClose()
    }
  }

  const handleConfirmReminders = async () => {
    if (!createdTask || !editableReminders || !createdTask.meeting_date) return

    const reminderInputs = buildMeetingReminders(createdTask.meeting_date, editableReminders)
    await createReminders.mutateAsync({
      taskId: createdTask.id,
      leadId: createdTask.lead_id,
      reminders: reminderInputs,
    })
    reset()
    onClose()
  }

  const handleSkipReminders = () => {
    reset()
    onClose()
  }

  const isMeeting = watchType === 'meeting'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>Nova Tarefa</DialogTitle>
              <DialogDescription>Crie uma tarefa para acompanhar atividades</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Titulo *</Label>
                <Input {...register('title')} placeholder="Ex: Ligar para o cliente" />
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
                <Label>Lead vinculado</Label>
                <Controller
                  control={control}
                  name="lead_id"
                  render={({ field }) => {
                    const filteredLeads = (allLeads ?? []).filter((l) => {
                      if (!leadSearch) return true
                      const q = leadSearch.toLowerCase()
                      return (l.name?.toLowerCase().includes(q) || l.phone.includes(q))
                    }).slice(0, 50)

                    return (
                      <Select value={field.value ?? ''} onValueChange={(v) => { field.onChange(v); setLeadSearch('') }}>
                        <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                        <SelectContent>
                          <div className="px-2 pb-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <input
                                value={leadSearch}
                                onChange={(e) => setLeadSearch(e.target.value)}
                                placeholder="Buscar lead..."
                                className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {filteredLeads.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name || l.phone}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  }}
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

              {/* Meeting fields */}
              <div className={cn(
                'space-y-4 overflow-hidden transition-all duration-300',
                isMeeting ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
              )}>
                <div className="border-t pt-4 space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dados da reuniao</p>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data e hora *</Label>
                      <Input type="datetime-local" {...register('meeting_date')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Duracao</Label>
                      <Controller
                        control={control}
                        name="meeting_duration"
                        render={({ field }) => (
                          <Select value={String(field.value ?? 60)} onValueChange={(v) => field.onChange(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {durationOptions.map((d) => (
                                <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Link da reuniao</Label>
                    <Input {...register('meeting_link')} placeholder="meet.google.com/..." />
                  </div>

                  <div className="space-y-2">
                    <Label>Email do lead</Label>
                    <Input type="email" {...register('meeting_lead_email')} placeholder="email@exemplo.com" />
                  </div>

                  <div className="space-y-2">
                    <Label>Observacoes da reuniao</Label>
                    <textarea
                      {...register('meeting_notes')}
                      className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                      placeholder="Pauta, objetivos..."
                    />
                  </div>
                </div>
              </div>

              {/* Non-meeting fields */}
              {!isMeeting && (
                <>
                  <div className="space-y-2">
                    <Label>Data de vencimento</Label>
                    <Input type="datetime-local" {...register('due_date')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Descricao</Label>
                    <textarea
                      {...register('description')}
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                      placeholder="Detalhes da tarefa..."
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { reset(); onClose() }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createTask.isPending}>
                  {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isMeeting ? 'Criar e agendar' : 'Criar tarefa'}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Lembretes gerados pela IA
              </DialogTitle>
              <DialogDescription>Revise e edite os lembretes antes de confirmar</DialogDescription>
            </DialogHeader>

            {generatingAI ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Gerando lembretes personalizados...</p>
              </div>
            ) : editableReminders ? (
              <div className="space-y-4">
                {([
                  { key: 'reminder_48h' as const, label: '48 horas antes', channel: 'WhatsApp + Email' },
                  { key: 'reminder_2h' as const, label: '2 horas antes', channel: 'WhatsApp + Email' },
                  { key: 'reminder_15min' as const, label: '15 minutos antes', channel: 'WhatsApp' },
                ]).map((r) => (
                  <div key={r.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">{r.label}</Label>
                      <span className="text-[10px] text-muted-foreground">{r.channel}</span>
                    </div>
                    <textarea
                      value={editableReminders[r.key]}
                      onChange={(e) => setEditableReminders((prev) => prev ? { ...prev, [r.key]: e.target.value } : prev)}
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                    />
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={handleSkipReminders}>
                    Pular lembretes
                  </Button>
                  <Button
                    onClick={handleConfirmReminders}
                    disabled={createReminders.isPending}
                  >
                    {createReminders.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar agendamento
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { CreateTaskModal }
