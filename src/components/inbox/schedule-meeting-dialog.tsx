import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useLeadDetail } from '@/hooks/use-lead-detail'
import { useGoogleCalendarConnection } from '@/hooks/use-google-calendar'
import { invalidateAllTasks } from '@/hooks/use-tasks'
import { useSendMessage } from '@/hooks/use-messages'
import { useAuthStore } from '@/stores/auth.store'
import { createTask } from '@/services/tasks.service'
import { updateLead } from '@/services/leads.service'
import { createCalendarEventForTask } from '@/services/google-calendar.service'
import { invalidateLeadDependentQueries } from '@/lib/query-keys'
import type { Task } from '@/types/database'

const schema = z.object({
  title: z.string().min(1, 'Titulo obrigatorio'),
  meeting_date: z.string().min(1, 'Data e hora obrigatorias'),
  meeting_duration: z.number(),
  meeting_lead_email: z.string().min(1, 'Email obrigatorio').email('Email invalido'),
  meeting_link: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  notify_whatsapp: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface ScheduleMeetingDialogProps {
  leadId: string
  onClose: () => void
}

const durationOptions = [
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2 horas' },
]

/**
 * O valor do <input type="datetime-local"> nao carrega fuso. Convertido aqui
 * para instante ISO com o offset do navegador, para o evento no Google nascer
 * no horario que o vendedor digitou.
 */
const toIsoInstant = (localValue: string): string => new Date(localValue).toISOString()

const formatMeetingPtBr = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })

const ScheduleMeetingDialog = ({ leadId, onClose }: ScheduleMeetingDialogProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const profile = useAuthStore((s) => s.profile)
  const companyId = useAuthStore((s) => s.company?.id)
  const { data: lead, isLoading: loadingLead } = useLeadDetail(leadId)
  const { data: connection } = useGoogleCalendarConnection()
  const sendMessage = useSendMessage()

  const notConnected = !connection || !connection.is_active

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title: '',
        meeting_date: '',
        meeting_duration: 60,
        meeting_lead_email: '',
        meeting_link: '',
        description: '',
        notify_whatsapp: true,
      },
    })

  // O lead chega depois da primeira renderizacao: semeia o que o sistema ja sabe.
  useEffect(() => {
    if (!lead) return
    // Sem `leadDisplayName` de proposito: ele cai no telefone quando falta nome,
    // e o titulo vira o summary do evento, que chega ao cliente por email. Poder
    // editar antes de confirmar nao e o mesmo que editar. Sem nome, so "Reuniao".
    const name = lead.name?.trim()
    reset({
      title: name ? `Reuniao com ${name}` : 'Reuniao',
      meeting_date: '',
      meeting_duration: 60,
      meeting_lead_email: lead.email ?? '',
      meeting_link: '',
      description: '',
      notify_whatsapp: true,
    })
  }, [lead, reset])

  const onSubmit = async (values: FormValues) => {
    if (!lead || !companyId) return

    const meetingIso = toIsoInstant(values.meeting_date)
    const email = values.meeting_lead_email.trim()

    // Os passos 1 e 2 chamam o service direto, e nao os hooks de mutation, para
    // que este fluxo termine em UM toast so: quem agenda reuniao nao precisa ler
    // "Tarefa criada" nem "Lead atualizado", que sao implementacao.
    let task: Task
    try {
      // 1. O email digitado vira o email do lead. E assim que a base melhora com
      //    o uso, e o vendedor nao precisa digitar de novo na proxima reuniao.
      //    Efeito colateral silencioso de proposito: ele nao pediu isso.
      if (email && email !== lead.email) {
        await updateLead(companyId, leadId, { email })
        invalidateLeadDependentQueries(queryClient)
        queryClient.invalidateQueries({ queryKey: ['contacts'] })
      }

      // 2. A reuniao e uma tarefa. Assim herda lembretes, tela /tarefas e vinculo
      //    com o lead. due_date espelha meeting_date, como em create-task-modal.
      task = await createTask(companyId, {
        title: values.title,
        type: 'meeting',
        lead_id: leadId,
        assigned_to: profile?.id ?? null,
        created_by: profile?.id ?? null,
        due_date: meetingIso,
        description: values.description || null,
        meeting_date: meetingIso,
        meeting_duration: values.meeting_duration,
        meeting_link: values.meeting_link || null,
        meeting_lead_email: email,
      })
      invalidateAllTasks(queryClient)
    } catch (err) {
      // Aqui a reuniao nao existe. O dialogo fica aberto com tudo preenchido.
      toast.error(err instanceof Error ? err.message : 'Erro ao agendar a reuniao')
      return
    }

    // 3. O evento no Google. A tarefa ja existe: daqui para baixo nada mais
    //    pode fazer a reuniao se perder, so mudar o aviso que o vendedor le.
    const result = await createCalendarEventForTask(task.id)

    // 4. Confirmacao na propria conversa, se pedida.
    if (values.notify_whatsapp) {
      const linkLine = values.meeting_link ? ` Link: ${values.meeting_link}` : ''
      try {
        await sendMessage.mutateAsync({
          leadId,
          content: `Reuniao confirmada para ${formatMeetingPtBr(meetingIso)}.${linkLine}`,
        })
      } catch {
        // useSendMessage ja avisa o vendedor. Nao desfaz a reuniao.
      }
    }

    onClose()

    const goToIntegrations = () => navigate('/minha-conta?tab=integracoes')

    switch (result.status) {
      case 'created':
        toast.success(`Reuniao agendada, convite enviado para ${email}`)
        break
      case 'not_connected':
        toast.warning('Reuniao agendada. Google Agenda nao conectado, entao o convite nao foi enviado.', {
          action: { label: 'Conectar', onClick: goToIntegrations },
        })
        break
      case 'auth_expired':
        toast.warning('Reuniao agendada. E preciso reconectar o Google Agenda para enviar o convite.', {
          action: { label: 'Reconectar', onClick: goToIntegrations },
        })
        break
      default:
        toast.warning(`Reuniao agendada, mas o convite nao foi enviado: ${result.message ?? 'erro no Google'}`)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar reuniao</DialogTitle>
          <DialogDescription>
            A reuniao vira tarefa no Veltzy e o Google envia o convite ao cliente.
          </DialogDescription>
        </DialogHeader>

        {loadingLead ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {notConnected && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="text-destructive">
                    {connection
                      ? 'Sua conexao com o Google Agenda expirou.'
                      : 'Voce ainda nao conectou o Google Agenda.'}
                  </p>
                  <p className="text-muted-foreground">
                    A reuniao sera salva como tarefa, mas o convite nao sera enviado.{' '}
                    <button
                      type="button"
                      className="underline text-primary"
                      onClick={() => navigate('/minha-conta?tab=integracoes')}
                    >
                      {connection ? 'Reconectar' : 'Conectar agora'}
                    </button>
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Titulo *</Label>
              <Input {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data e hora *</Label>
                <Input type="datetime-local" {...register('meeting_date')} />
                {errors.meeting_date && (
                  <p className="text-xs text-destructive">{errors.meeting_date.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Duracao</Label>
                <Controller
                  control={control}
                  name="meeting_duration"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
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
              <Label>Email do cliente *</Label>
              <Input type="email" {...register('meeting_lead_email')} placeholder="email@exemplo.com" />
              {errors.meeting_lead_email && (
                <p className="text-xs text-destructive">{errors.meeting_lead_email.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                E para este endereco que o Google envia o convite.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Link da reuniao</Label>
              <Input {...register('meeting_link')} placeholder="meet.google.com/..." />
            </div>

            <div className="space-y-2">
              <Label>Descricao</Label>
              <textarea
                {...register('description')}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                placeholder="Pauta, objetivos..."
              />
            </div>

            <Controller
              control={control}
              name="notify_whatsapp"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  Enviar confirmacao no WhatsApp
                </label>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agendar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { ScheduleMeetingDialog }
