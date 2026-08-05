import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Trash2, UserPlus, ArrowRight, User, MessageSquare, Plus, CheckSquare, Phone, Video, MessageCircle as FollowUpIcon, Check, UserRoundPen } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { useUpdateLead, useDeleteLead } from '@/hooks/use-leads'
import { useDealsByLead, useUpdateDeal, useAssignDeal, useDeleteDeal } from '@/hooks/use-deals'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useLeadActivityLogs } from '@/hooks/use-activity-logs'
import { useTeamMembers } from '@/hooks/use-team'
import { useRoles } from '@/hooks/use-roles'
import { triggerCelebration } from '@/lib/celebration'
import { isValidPhoneBR, PHONE_ERROR_MSG } from '@/lib/phone'
import { useLeadTasks, useCompleteTask } from '@/hooks/use-tasks'
import { CreateTaskModal } from '@/components/tarefas/create-task-modal'
import { leadTemperatureConfig } from '@/lib/lead-config'
import type { LeadWithDetails, ActivityLog, TaskType, UpdateLeadInput } from '@/types/database'

const schema = z.object({
  // Contato
  name: z.string().optional(),
  phone: z
    .string()
    .min(1, 'Telefone obrigatorio')
    .refine(isValidPhoneBR, PHONE_ERROR_MSG),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  company_name: z.string().optional(),
  source_id: z.string().optional(),
  observations: z.string().optional(),
  tags: z.array(z.string()),
  instagram_handle: z.string().optional(),
  linkedin_url: z.string().optional(),
  // Negocio
  deal_name: z.string().optional(),
  deal_value: z.number().nonnegative().optional(),
  deal_observations: z.string().optional(),
  stage_id: z.string().uuid(),
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
  const deleteDeal = useDeleteDeal()
  const assignDeal = useAssignDeal()
  const { data: deals } = useDealsByLead(lead?.id)
  const activeDeal = dealId ? deals?.find((d) => d.id === dealId) : deals?.[0]
  const { data: stages } = usePipelineStages(activeDeal?.pipeline_id ?? lead?.pipeline_id)
  const { data: sources } = useLeadSources()
  const { data: members } = useTeamMembers()
  const { isAdmin, isManager } = useRoles()
  const [transferOpen, setTransferOpen] = useState(false)
  const [pendingAssignTo, setPendingAssignTo] = useState<string | null>(null)
  const [deleteDealOpen, setDeleteDealOpen] = useState(false)

  const { register, handleSubmit, control, reset, formState: { errors, dirtyFields } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (lead) {
      setPendingAssignTo(null)
      setTransferOpen(false)
      setDeleteDealOpen(false)
      reset({
        name: lead.name ?? '',
        // lead.phone vem com 55: PhoneInput/formatPhoneBR removem para exibir mascarado
        // e o submit e idempotente via normalizePhoneBR na service.
        phone: lead.phone,
        email: lead.email ?? '',
        company_name: lead.company_name ?? '',
        source_id: lead.source_id ?? undefined,
        observations: lead.observations ?? '',
        tags: lead.tags,
        instagram_handle: lead.instagram_handle ?? '',
        linkedin_url: lead.linkedin_url ?? '',
        deal_name: activeDeal?.name ?? '',
        deal_value: activeDeal?.value ?? lead.deal_value ?? 0,
        deal_observations: activeDeal?.observations ?? '',
        stage_id: activeDeal?.stage_id ?? lead.stage_id,
      })
    }
  }, [lead, activeDeal, reset])

  const onSubmit = async (values: FormValues) => {
    if (!lead) return

    const oldStageId = activeDeal?.stage_id ?? lead.stage_id
    const newStageId = values.stage_id

    // Atualizar contato (so dados de pessoa). stage_id/deal_value vao para o
    // deal abaixo; o espelho (trg_mirror_deal_to_lead) replica para o lead.
    //
    // A chave so entra no payload quando dirtyFields marca o campo como tocado.
    // Montar o objeto completo e deixar undefined nos nao-tocados nao serve: a
    // service repassa o payload direto para o .update(), e um campo que o
    // usuario nao encostou nao pode viajar para o banco de forma alguma.
    const contactData: UpdateLeadInput = {}
    if (dirtyFields.name) contactData.name = values.name || null
    if (dirtyFields.phone) contactData.phone = values.phone
    if (dirtyFields.email) contactData.email = values.email || null
    if (dirtyFields.company_name) contactData.company_name = values.company_name || null
    if (dirtyFields.source_id) contactData.source_id = values.source_id || null
    if (dirtyFields.observations) contactData.observations = values.observations || null
    if (dirtyFields.tags) contactData.tags = values.tags
    if (dirtyFields.instagram_handle) contactData.instagram_handle = values.instagram_handle || null
    if (dirtyFields.linkedin_url) contactData.linkedin_url = values.linkedin_url || null

    const hasContactChanges = Object.keys(contactData).length > 0
    if (hasContactChanges) {
      await updateLead.mutateAsync({ leadId: lead.id, data: contactData })
    }

    // Atualizar deal se existir
    if (activeDeal) {
      await updateDeal.mutateAsync({
        dealId: activeDeal.id,
        data: {
          name: values.deal_name || activeDeal.name,
          value: values.deal_value,
          stage_id: values.stage_id,
          observations: values.deal_observations?.trim() || null,
        },
      })

      // Transferir responsável (só persiste no Salvar)
      if (pendingAssignTo && pendingAssignTo !== activeDeal.assigned_to) {
        await assignDeal.mutateAsync({ dealId: activeDeal.id, userId: pendingAssignTo })
      }

      // O toast de sucesso vinha do useUpdateLead, que agora so dispara quando
      // ha mudanca de contato. Sem isto, editar so o negocio salvaria calado.
      if (!hasContactChanges) {
        toast.success('Negócio atualizado!')
      }
    }

    if (newStageId !== oldStageId) {
      const newStage = stages?.find((s) => s.id === newStageId)
      if (newStage?.is_final && newStage?.is_positive) {
        triggerCelebration()
        toast.success('Negócio fechado! 🎉')
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

  const handleDeleteDeal = async () => {
    if (!activeDeal) return
    await deleteDeal.mutateAsync(activeDeal.id)
    setDeleteDealOpen(false)
    onClose()
  }

  const effectiveAssignTo = pendingAssignTo ?? activeDeal?.assigned_to ?? null
  const currentAssignee = effectiveAssignTo
    ? members?.find((m) => m.id === effectiveAssignTo)
    : null

  const eligibleMembers = members?.filter((m) =>
    m.user_roles?.some((r) => ['admin', 'manager', 'seller', 'super_admin'].includes(r.role))
  ) ?? []

  if (!lead) return null

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead.name || lead.phone}</DialogTitle>
          <DialogDescription>
            {activeDeal ? `Negócio: ${activeDeal.name}` : 'Editar contato'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="info" className="px-2 text-xs sm:px-3 sm:text-sm">Informações</TabsTrigger>
            <TabsTrigger value="tasks" className="px-2 text-xs sm:px-3 sm:text-sm">Tarefas</TabsTrigger>
            <TabsTrigger value="history" className="px-2 text-xs sm:px-3 sm:text-sm">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* SEÇÃO: NEGÓCIO */}
              {activeDeal && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Negócio</span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>

                  <div className="space-y-2">
                    <Label>Nome do negócio</Label>
                    <Input
                      placeholder="Ex: Orçamento de treinamento, Brindes fim de ano..."
                      {...register('deal_name')}
                    />
                  </div>

                  {/* Anotacoes do negocio: distintas das Observações do contato,
                      que ficam na secao de baixo e vivem em leads.observations. */}
                  <div className="space-y-2">
                    <Label htmlFor="deal-observations">Anotações sobre o negócio</Label>
                    <textarea
                      id="deal-observations"
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 input-clean"
                      placeholder="Contexto, combinados, proximos passos..."
                      {...register('deal_observations')}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Controller
                        control={control}
                        name="deal_value"
                        render={({ field }) => (
                          <CurrencyInput
                            placeholder="R$ 0,00"
                            value={field.value ?? 0}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                          />
                        )}
                      />
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

                  {/* Temperatura read-only (calculada por T1) */}
                  <div className="space-y-2">
                    <Label>Temperatura</Label>
                    <div className="flex items-center gap-3 rounded-md border border-input px-3 py-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: leadTemperatureConfig[lead.temperature].width,
                            background: leadTemperatureConfig[lead.temperature].gradient,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground shrink-0">
                        {leadTemperatureConfig[lead.temperature].label}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Calculada automaticamente pela atividade do contato</p>
                  </div>

                  {/* Dono do negócio */}
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
                        {currentAssignee?.name ?? 'Sem responsável'}
                      </div>
                      {(isAdmin || isManager) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTransferOpen((v) => !v)}
                        >
                          <UserRoundPen className="h-3.5 w-3.5 mr-1" />
                          Transferir
                        </Button>
                      )}
                    </div>
                    {transferOpen && (isAdmin || isManager) && (
                      <Select value={pendingAssignTo ?? ''} onValueChange={(v) => { setPendingAssignTo(v); setTransferOpen(false) }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Remover negocio: separado por uma linha para nao se confundir
                      com o "Remover" do contato, que fica no rodape do form. */}
                  {/* depende da migration do Hub que libera manager no DELETE de deals; ate la, manager recebe recusa silenciosa do RLS */}
                  {(isAdmin || isManager) && (
                    <div className="border-t border-border/50 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteDealOpen(true)}
                        disabled={deleteDeal.isPending}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remover negócio
                      </Button>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Remove apenas este negócio. O contato permanece.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* SEÇÃO: CONTATO */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Contato</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field }) => (
                      <PhoneInput
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="(11) 99999-9999"
                      />
                    )}
                  />
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
                <Label>Empresa do cliente</Label>
                <Input
                  placeholder="Ex: Clínica Silva, Escritório Martins..."
                  {...register('company_name')}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Instagram</Label>
                  <Input
                    placeholder="@usuario"
                    {...register('instagram_handle')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn</Label>
                  <Input
                    placeholder="linkedin.com/in/usuario"
                    {...register('linkedin_url')}
                  />
                </div>
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

              {/* Campos que só aparecem se NÃO tem deal (fallback para editar direto no lead) */}
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
                    <div className="flex items-center gap-3 rounded-md border border-input px-3 py-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: leadTemperatureConfig[lead.temperature].width,
                            background: leadTemperatureConfig[lead.temperature].gradient,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground shrink-0">
                        {leadTemperatureConfig[lead.temperature].label}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input type="number" step="0.01" {...register('deal_value', { valueAsNumber: true })} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observações</Label>
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
                {/* depende da migration do Hub que libera manager no DELETE de deals/leads; ate la, manager recebe recusa silenciosa do RLS */}
                {(isAdmin || isManager) && <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteLead.isPending}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remover
                </Button>}
                {/* ml-auto ancora o grupo a direita mesmo quando o Remover nao
                    renderiza e o justify-between fica com um filho so. */}
                <div className="ml-auto flex gap-2">
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

    <AlertDialog open={deleteDealOpen} onOpenChange={setDeleteDealOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Remover negócio{activeDeal ? `: ${activeDeal.name}` : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Isto remove apenas este negócio. O contato e o histórico dele permanecem.
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteDealOpen(false)}
            disabled={deleteDeal.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteDeal}
            disabled={deleteDeal.isPending}
          >
            {deleteDeal.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removendo...
              </>
            ) : (
              'Remover negócio'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

const actionConfig: Record<string, { icon: typeof UserPlus; label: string }> = {
  created: { icon: UserPlus, label: 'Lead criado' },
  stage_changed: { icon: ArrowRight, label: 'Movido para' },
  assigned: { icon: User, label: 'Atribuído a' },
  message_sent: { icon: MessageSquare, label: 'Mensagem enviada' },
  status_changed: { icon: ArrowRight, label: 'Status alterado para' },
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
  if(log.action === 'status_changed' && meta.to_status) {
    return `${config.label} ${(meta.to_status as string) ?? 'outro status'}`
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
