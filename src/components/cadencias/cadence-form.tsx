import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { useCreateCadence } from '@/hooks/use-cadences'
import { useCampaignTemplates } from '@/hooks/use-campaigns'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { StageMultiSelect } from '@/components/mkt-ativo/stage-multi-select'
import type { CadenceStepAction, CadenceTriggerEvent, CadenceCondition } from '@/types/database'

interface StepDraft {
  action_type: CadenceStepAction
  config: Record<string, unknown>
}

const ACTIONS: { value: CadenceStepAction; label: string; aiOnly?: boolean }[] = [
  { value: 'send_message', label: 'Enviar mensagem' },
  { value: 'send_template', label: 'Enviar template' },
  { value: 'generate_ai', label: 'Gerar mensagem com IA', aiOnly: true },
  { value: 'wait', label: 'Aguardar (delay)' },
  { value: 'add_tag', label: 'Adicionar tag' },
  { value: 'remove_tag', label: 'Remover tag' },
  { value: 'change_stage', label: 'Mudar etapa' },
]

const TRIGGER_EVENTS: CadenceTriggerEvent[] = [
  'lead_created', 'lead_stage_changed', 'lead_temperature_changed',
  'message_received', 'no_response', 'deal_closed', 'lead_lost',
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CadenceForm({ open, onOpenChange }: Props) {
  const [name, setName] = useState('')
  const [startMode, setStartMode] = useState<'manual' | 'event'>('manual')
  const [triggerEvent, setTriggerEvent] = useState<CadenceTriggerEvent>('lead_created')
  const [triggerStageIds, setTriggerStageIds] = useState<string[]>([])
  const [cancelOnStage, setCancelOnStage] = useState(false)
  const [steps, setSteps] = useState<StepDraft[]>([{ action_type: 'send_message', config: {} }])

  const { data: templates } = useCampaignTemplates()
  const createCadence = useCreateCadence()
  const aiEnabled = useAuthStore((s) => s.company?.features?.ai_msg_enabled) === true
  const actionOptions = ACTIONS.filter((a) => !a.aiOnly || aiEnabled)

  const reset = () => {
    setName(''); setStartMode('manual'); setTriggerEvent('lead_created'); setTriggerStageIds([]); setCancelOnStage(false)
    setSteps([{ action_type: 'send_message', config: {} }])
  }
  const close = () => { onOpenChange(false); setTimeout(reset, 200) }

  const setStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const setStepConfig = (i: number, key: string, value: unknown) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, config: { ...s.config, [key]: value } } : s)))

  const canSave = name.trim() !== '' && steps.length > 0 && !createCadence.isPending

  const handleSave = async () => {
    try {
      await createCadence.mutateAsync({
        name: name.trim(),
        trigger_event: startMode === 'event' ? triggerEvent : null,
        trigger_conditions: (startMode === 'event' && triggerStageIds.length > 0
          ? [{ field: 'stage_id', operator: 'in', value: triggerStageIds }]
          : []) as CadenceCondition[],
        cancel_on_stage_change: cancelOnStage,
        steps: steps.map((s) => ({ action_type: s.action_type, config: s.config })),
      })
      close()
    } catch { /* toast no hook */ }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Nova cadência</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cad-name">Nome</Label>
            <Input id="cad-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nutrição pós-cadastro" />
          </div>

          {/* Gatilho */}
          <div className="space-y-1.5">
            <Label>Como inicia</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStartMode('manual')}
                className={`rounded-md border px-3 py-1.5 text-sm ${startMode === 'manual' ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>
                Manual
              </button>
              <button type="button" onClick={() => setStartMode('event')}
                className={`rounded-md border px-3 py-1.5 text-sm ${startMode === 'event' ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>
                Por evento
              </button>
            </div>
            {startMode === 'event' && (
              <>
                <Select value={triggerEvent} onValueChange={(v) => setTriggerEvent(v as CadenceTriggerEvent)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="mt-2 space-y-1.5">
                  <Label>Só nestas etapas (condição opcional)</Label>
                  <StageMultiSelect value={triggerStageIds} onChange={setTriggerStageIds} />
                </div>
              </>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={cancelOnStage} onCheckedChange={setCancelOnStage} />
            Cancelar se o lead mudar de etapa
          </label>

          {/* Steps */}
          <div className="space-y-2">
            <Label>Passos</Label>
            {steps.map((s, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <Select value={s.action_type} onValueChange={(v) => setStep(i, { action_type: v as CadenceStepAction, config: {} })}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{actionOptions.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {steps.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>

                {s.action_type === 'send_message' && (
                  <Input placeholder="Conteúdo da mensagem" value={String(s.config.content ?? '')}
                    onChange={(e) => setStepConfig(i, 'content', e.target.value)} />
                )}
                {s.action_type === 'generate_ai' && (
                  <div className="space-y-1">
                    <Input placeholder="Instrução para a IA (ex: convide o lead pra uma demo)" value={String(s.config.prompt ?? '')}
                      onChange={(e) => setStepConfig(i, 'prompt', e.target.value)} />
                    <p className="text-xs text-amber-600">⚡ Gera a mensagem com IA por contato — consome crédito de IA da empresa (custo).</p>
                  </div>
                )}
                {s.action_type === 'send_template' && (
                  <Select value={String(s.config.template_id ?? '')} onValueChange={(v) => setStepConfig(i, 'template_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Escolha o template" /></SelectTrigger>
                    <SelectContent>{templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {s.action_type === 'wait' && (
                  <div className="flex gap-2">
                    <Input type="number" min={0} placeholder="dias" value={String(s.config.days ?? '')}
                      onChange={(e) => setStepConfig(i, 'days', Number(e.target.value))} />
                    <Input type="number" min={0} placeholder="horas" value={String(s.config.hours ?? '')}
                      onChange={(e) => setStepConfig(i, 'hours', Number(e.target.value))} />
                  </div>
                )}
                {(s.action_type === 'add_tag' || s.action_type === 'remove_tag') && (
                  <Input placeholder="Tag" value={String(s.config.tag ?? '')}
                    onChange={(e) => setStepConfig(i, 'tag', e.target.value)} />
                )}
                {s.action_type === 'change_stage' && (
                  <Input placeholder="ID da etapa (stage_id)" value={String(s.config.stage_id ?? '')}
                    onChange={(e) => setStepConfig(i, 'stage_id', e.target.value)} />
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSteps((p) => [...p, { action_type: 'send_message', config: {} }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar passo
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {createCadence.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Criar cadência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
