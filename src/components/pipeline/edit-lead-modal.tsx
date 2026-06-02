import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Trash2, UserPlus, ArrowRight, User, MessageSquare, Plus, CheckSquare, Phone, Video, MessageCircle as FollowUpIcon, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { useUpdateLead, useDeleteLead } from '@/hooks/use-leads'
import { useDealsByLead, useUpdateDeal } from '@/hooks/use-deals'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useLeadActivityLogs } from '@/hooks/use-activity-logs'
import { triggerCelebration } from '@/lib/celebration'
import { useLeadTasks, useCompleteTask } from '@/hooks/use-tasks'
import { CreateTaskModal } from '@/components/tarefas/create-task-modal'
import type { LeadWithDetails, LeadTemperature, ActivityLog, TaskType } from '@/types/database'
import { leadTemperatureConfig } from '@/lib/lead-config'

const schema = z.object({
  // Contato
  name: z.string().optional(),
  phone: z.string().min(8, 'Telefone invalido'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  source_id: z.string().optional(),
  observations: z.string().optional(),
  tags: z.array(z.string()),
  // Negocio
  deal_name: z.string().optional(),
  deal_value: z.number().nonnegative().optional(),
  stage_id: z.string().uuid(),
  temperature: z.enum(['cold', 'warm', 'hot', 'fire']),
})

type FormValues = z.infer<typeof schema>

interface EditLeadModalProps {
  lead: LeadWithDetails | null
  open: boolean
  onClose: () => void
  dealId?: string | null
}

const EditLeadModal = ({ lead, open, onClose, dealId }: EditLeadModalProps) => {
  const updateLead = useUpdateLead()
  const updateDeal = useUpdateDeal()
  const deleteLead = useDeleteLead()
  const { data: deals } = useDealsByLead(lead?.id)
  const activeDeal = dealId ? deals?.find((d) => d.id === dealId) : deals?.[0]
  const { data: stages } = usePipelineStages(activeDeal?.pipeline_id ?? lead?.pipeline_id)
  const { data: sources } = useLeadSources()

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (lead) {
      reset({
        name: lead.name ?? '',
        phone: lead.phone,
        email: lead.email ?? '',
        source_id: lead.source_id ?? undefined,
        observations: lead.observations ?? '',
        tags: lead.tags,
        deal_name: activeDeal?.name ?? '',
        deal_value: activeDeal?.value ?? lead.deal_value ?? 0,
        stage_id: activeDeal?.stage_id ?? lead.stage_id,
        temperature: lead.temperature,
      })
    }
  }, [lead, activeDeal, reset])

  const onSubmit = async (values: FormValues) => {
    if (!lead) return

    const oldStageId = activeDeal?.stage_id ?? lead.stage_id
    const newStageId = values.stage_id

    // Atualizar contato
    await updateLead.mutateAsync({
      leadId: lead.id,
      data: {
        name: values.name || null,
        phone: values.phone,
        email: values.email || null,
        source_id: values.source_id || null,
        temperature: values.temperature,
        observations: values.observations || null,
        tags: values.tags,
        deal_value: values.deal_value || null,
        stage_id: values.stage_id,
      },
    })

    // Atualizar deal se existir
    if (activeDeal) {
      await updateDeal.mutateAsync({
        dealId: activeDeal.id,
        data: {
          name: values.deal_name || activeDeal.name,
          value: values.deal_value,
          stage_id: values.stage_id,
        },
      })
    }

    if (newStageId !== oldStageId) {
      const newStage = stages?.find((s) => s.id === newStageId)
      if (newStage?.is_final && newStage?.is_positive) {
        triggerCelebration()
        toast.success('Negocio fechado! 🎉')
      }
    }

    onClose()
  }

  const handleDelete = async () => {
    if (!lead) return
    if (!confirm('Tem certeza que deseja remover este lead?')) return
    await deleteLead.mutateAsync(lead.id)
    onClose()
  }

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead.name || lead.phone}</DialogTitle>
          <DialogDescription>
            {activeDeal ? `Negocio: ${activeDeal.name}` : 'Editar contato'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Informacoes</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="history">Historico</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* SECAO: NEGOCIO */}
              {activeDeal && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Negocio</span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>

                  <div className="space-y-2">
                    <Label>Nome do negocio</Label>
                    <Input
                      placeholder="Ex: Orcamento de treinamento, Brindes fim de ano..."
                      {...register('deal_name')}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Input type="number" step="0.01" {...register('deal_value', { valueAsNumber: true })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Fase</Label>
                      <Controller
                        control={control}
                        name="stage_id"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {stages?.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Temperatura</Label>
                    <Controller
                      control={control}
                      name="temperature"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={(v) => field.onChange(v as LeadTemperature)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(leadTemperatureConfig) as LeadTemperature[]).map((t) => (
                              <SelectItem key={t} value={t}>
                                {leadTemperatureConfig[t].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </>
              )}

              {/* SECAO: CONTATO */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contato</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input {...register('phone')} />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input {...register('name')} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" {...register('email')} />
              </div>

              <div className="space-y-2">
                <Label>Origem</Label>
                <Controller
                  control={control}
                  name="source_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {sources?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Campos que so aparecem se NAO tem deal (fallback para editar direto no lead) */}
              {!activeDeal && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Fase</Label>
                    <Controller
                      control={control}
                      name="stage_id"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {stages?.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temperatura</Label>
                    <Controller
                      control={control}
                      name="temperature"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={(v) => field.onChange(v as LeadTemperature)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(leadTemperatureConfig) as LeadTemperature[]).map((t) => (
                              <SelectItem key={t} value={t}>
                                {leadTemperatureConfig[t].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" {...register('deal_value', { valueAsNumber: true })} />
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Score IA: <span className="font-medium text-foreground">{lead.ai_score}/100</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: <span className="font-medium text-foreground">{lead.conversation_status}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Criado em: <span className="font-medium text-foreground">
                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Observacoes</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 input-clean"
                  {...register('observations')}
                />
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <Controller
                  control={control}
                  name="tags"
                  render={({ field }) => (
                    <LeadTagsInput value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteLead.isPending}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remover
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                  <Button type="submit" disabled={updateLead.isPending || updateDeal.isPending}>
                    {(updateLead.isPending || updateDeal.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <LeadTasksTab leadId={lead.id} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <LeadTimeline leadId={lead.id} stages={stages} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const actionConfig: Record<string, { icon: typeof UserPlus; label: string }> = {
  created: { icon: UserPlus, label: 'Lead criado' },
  stage_changed: { icon: ArrowRight, label: 'Movido para' },
  assigned: { icon: User, label: 'Atribuido a' },
  message_sent: { icon: MessageSquare, label: 'Mensagem enviada' },
}

const formatActivityLabel = (log: ActivityLog, stages?: { id: string; name: string }[]) => {
  const meta = log.metadata ?? {}
  const config = actionConfig[log.action]
  if (!config) return log.action

  if (log.action === 'stage_changed' && meta.to_stage) {
    const stageName = stages?.find((s) => s.id === meta.to_stage)?.name ?? 'outra fase'
    return `${config.label} ${stageName}`
  }
  if (log.action === 'assigned' && meta.to) {
    return `${config.label} ${(meta.to_name as string) ?? 'outro vendedor'}`
  }
  return config.label
}

const LeadTimeline = ({
  leadId,
  stages,
}: {
  leadId: string
  stages?: { id: string; name: string }[]
}) => {
  const { data: logs, isLoading } = useLeadActivityLogs(leadId)

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    )
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda</p>
      </div>
    )
  }

  return (
    <div className="max-h-[40vh] overflow-y-auto space-y-0">
      {logs.map((log, idx) => {
        const config = actionConfig[log.action] ?? actionConfig.created
        const Icon = config.icon
        const isLast = idx === logs.length - 1

        return (
          <div key={log.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/50" />}
            </div>
            <div className="pb-4 pt-0.5">
              <p className="text-sm font-medium">{formatActivityLabel(log, stages)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const taskTypeIcons: Record<TaskType, typeof CheckSquare> = {
  todo: CheckSquare,
  followup: FollowUpIcon,
  call: Phone,
  meeting: Video,
}

const taskStatusLabels: Record<string, string> = {
  pending: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Feito',
}

const LeadTasksTab = ({ leadId }: { leadId: string }) => {
  const { data: tasks, isLoading } = useLeadTasks(leadId)
  const completeTask = useCompleteTask()
  const [createOpen, setCreateOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Tarefas do lead</p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Nova tarefa
          </Button>
        </div>

        {!tasks || tasks.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">Nenhuma tarefa vinculada</p>
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto space-y-2">
            {tasks.map((task) => {
              const Icon = taskTypeIcons[task.type]
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg border border-border/30 p-2.5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{taskStatusLabels[task.status] ?? task.status}</span>
                      {task.due_date && (
                        <span>
                          {new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  {task.status !== 'done' && (
                    <button
                      onClick={() => completeTask.mutate(task.id)}
                      className="rounded p-1 text-muted-foreground hover:text-primary transition-smooth shrink-0"
                      title="Marcar como feita"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultLeadId={leadId}
      />
    </>
  )
}

export { EditLeadModal }
