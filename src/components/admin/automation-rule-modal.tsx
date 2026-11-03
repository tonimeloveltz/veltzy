import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateRule, useUpdateRule } from '@/hooks/use-automation-rules'
import type { AutomationRule, AutomationTrigger, AutomationAction } from '@/types/database'

const triggers: { value: AutomationTrigger; label: string }[] = [
  { value: 'lead_created', label: 'Lead criado' },
  { value: 'lead_stage_changed', label: 'Fase alterada' },
  { value: 'lead_temperature_changed', label: 'Temperatura alterada' },
  { value: 'message_received', label: 'Mensagem recebida' },
  { value: 'no_response', label: 'Sem resposta' },
  { value: 'deal_closed', label: 'Negocio fechado' },
  { value: 'lead_lost', label: 'Lead perdido' },
]

const actions: { value: AutomationAction; label: string }[] = [
  { value: 'send_message', label: 'Enviar mensagem' },
  { value: 'change_stage', label: 'Mudar fase' },
  { value: 'assign_lead', label: 'Atribuir lead' },
  { value: 'add_tag', label: 'Adicionar tag' },
  { value: 'remove_tag', label: 'Remover tag' },
  { value: 'update_temperature', label: 'Alterar temperatura' },
  { value: 'notify_team', label: 'Notificar equipe' },
]

interface FormValues {
  name: string
  trigger_type: AutomationTrigger
  action_type: AutomationAction
  action_value: string
  priority: number
  is_enabled: boolean
}

interface AutomationRuleModalProps {
  rule: AutomationRule | null
  open: boolean
  onClose: () => void
}

const AutomationRuleModal = ({ rule, open, onClose }: AutomationRuleModalProps) => {
  const createRule = useCreateRule()
  const updateRule = useUpdateRule()

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormValues>({
    defaultValues: {
      name: '',
      trigger_type: 'lead_created',
      action_type: 'notify_team',
      action_value: '',
      priority: 0,
      is_enabled: true,
    },
  })

  useEffect(() => {
    if (rule) {
      reset({
        name: rule.name,
        trigger_type: rule.trigger_type,
        action_type: rule.action_type,
        action_value: (rule.action_data as Record<string, string>).message ?? (rule.action_data as Record<string, string>).tag ?? '',
        priority: rule.priority,
        is_enabled: rule.is_enabled,
      })
    } else {
      reset({ name: '', trigger_type: 'lead_created', action_type: 'notify_team', action_value: '', priority: 0, is_enabled: true })
    }
  }, [rule, reset])

  const onSubmit = async (values: FormValues) => {
    const actionData: Record<string, unknown> = {}
    if (['send_message', 'notify_team'].includes(values.action_type)) {
      actionData.message = values.action_value
      actionData.title = values.name
      actionData.body = values.action_value
    } else if (['add_tag', 'remove_tag'].includes(values.action_type)) {
      actionData.tag = values.action_value
    } else if (values.action_type === 'update_temperature') {
      actionData.temperature = values.action_value
    } else if (values.action_type === 'change_stage') {
      actionData.stage_id = values.action_value
    } else if (values.action_type === 'assign_lead') {
      actionData.profile_id = values.action_value
    }

    if (rule) {
      await updateRule.mutateAsync({
        id: rule.id,
        data: {
          name: values.name,
          trigger_type: values.trigger_type,
          action_type: values.action_type,
          action_data: actionData,
          priority: values.priority,
          is_enabled: values.is_enabled,
        },
      })
    } else {
      await createRule.mutateAsync({
        name: values.name,
        trigger_type: values.trigger_type,
        conditions: [],
        action_type: values.action_type,
        action_data: actionData,
        priority: values.priority,
        is_enabled: values.is_enabled,
      })
    }
    onClose()
  }

  const isPending = createRule.isPending || updateRule.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar Regra' : 'Nova Regra'}</DialogTitle>
          <DialogDescription>Configure o trigger e a acao automatica</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input placeholder="Nome da regra" {...register('name')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Quando</Label>
              <Select value={watch('trigger_type')} onValueChange={(v) => setValue('trigger_type', v as AutomationTrigger)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {triggers.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entao</Label>
              <Select value={watch('action_type')} onValueChange={(v) => setValue('action_type', v as AutomationAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {actions.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Valor da acao</Label>
            <Input placeholder="Mensagem, tag, ID..." {...register('action_value')} />
            {watch('action_type') === 'send_message' && (
              <p className="text-xs text-muted-foreground">
                Variáveis: {'{{nome}}'} (primeiro nome) · {'{{sobrenome}}'} · {'{{nome_completo}}'} · {'{{telefone}}'} · {'{{empresa}}'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Input type="number" {...register('priority', { valueAsNumber: true })} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rule ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { AutomationRuleModal }
