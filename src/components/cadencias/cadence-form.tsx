import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { useCreateCadence } from '@/hooks/use-cadences'
import { useCampaignTemplates } from '@/hooks/use-campaigns'
import { useLeadSources } from '@/hooks/use-lead-sources'
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

// Gatilho: 'manual' = sem evento (start manual). Os demais mapeiam trigger_event.
type TriggerChoice = 'manual' | CadenceTriggerEvent
const TRIGGERS: { value: TriggerChoice; label: string }[] = [
  { value: 'lead_created', label: 'Novo contato' },
  { value: 'stage_changed', label: 'Status/etapa alterado para…' },
  { value: 'tag_added', label: 'Tag adicionada ao contato' },
  { value: 'recurring', label: 'Agendamento recorrente' },
  { value: 'webhook', label: 'Webhook recebido' },
  { value: 'manual', label: 'Manual' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CadenceForm({ open, onOpenChange }: Props) {
  const [name, setName] = useState('')
  // QUANDO ISSO ACONTECER
  const [trigger, setTrigger] = useState<TriggerChoice>('manual')
  const [stageTargets, setStageTargets] = useState<string[]>([]) // stage_changed: para quais etapas
  const [tagName, setTagName] = useState('')                     // tag_added: qual tag
  const [recFreq, setRecFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily') // recurring
  const [recTime, setRecTime] = useState('09:00')
  const [recDow, setRecDow] = useState(1)                        // 0=Dom..6=Sáb (weekly)
  const [recDom, setRecDom] = useState(1)                        // dia do mês (monthly)
  const [webhookToken, setWebhookToken] = useState('')           // webhook (gerado)
  const [sourceId, setSourceId] = useState('')                   // filtro por origem
  // SOMENTE SE
  const [onlyStageIds, setOnlyStageIds] = useState<string[]>([])
  const [cancelOnStage, setCancelOnStage] = useState(false)
  // ENTÃO FAZER
  const [steps, setSteps] = useState<StepDraft[]>([{ action_type: 'send_message', config: {} }])

  const { data: templates } = useCampaignTemplates()
  const { data: leadSources } = useLeadSources()
  const createCadence = useCreateCadence()
  const aiEnabled = useAuthStore((s) => s.company?.features?.ai_msg_enabled) === true
  const actionOptions = ACTIONS.filter((a) => !a.aiOnly || aiEnabled)

  const reset = () => {
    setName(''); setTrigger('manual'); setStageTargets([]); setTagName(''); setWebhookToken('')
    setRecFreq('daily'); setRecTime('09:00'); setRecDow(1); setRecDom(1)
    setSourceId(''); setOnlyStageIds([]); setCancelOnStage(false)
    setSteps([{ action_type: 'send_message', config: {} }])
  }
  const close = () => { onOpenChange(false); setTimeout(reset, 200) }

  const setStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const setStepConfig = (i: number, key: string, value: unknown) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, config: { ...s.config, [key]: value } } : s)))

  const pickTrigger = (t: TriggerChoice) => {
    setTrigger(t)
    if (t === 'webhook' && !webhookToken) {
      setWebhookToken((crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, ''))
    }
  }

  const canSave = name.trim() !== '' && steps.length > 0 && !createCadence.isPending

  const buildConditions = (): CadenceCondition[] => {
    const c: CadenceCondition[] = []
    if (trigger === 'stage_changed' && stageTargets.length) c.push({ field: 'to_stage_id', operator: 'in', value: stageTargets })
    if (trigger === 'tag_added' && tagName.trim()) c.push({ field: 'tag', operator: 'eq', value: tagName.trim() })
    if (sourceId) c.push({ field: 'source_id', operator: 'eq', value: sourceId })
    if (onlyStageIds.length) c.push({ field: 'stage_id', operator: 'in', value: onlyStageIds })
    return c
  }

  // Monta o preset de recorrência: daily@HH:MM / weekly@<dow>@HH:MM / monthly@<dom>@HH:MM.
  const buildRecurringCron = (): string =>
    recFreq === 'daily' ? `daily@${recTime}`
    : recFreq === 'weekly' ? `weekly@${recDow}@${recTime}`
    : `monthly@${recDom}@${recTime}`

  const save = async (isEnabled: boolean) => {
    try {
      await createCadence.mutateAsync({
        name: name.trim(),
        trigger_event: trigger === 'manual' ? null : trigger,
        trigger_conditions: buildConditions(),
        cancel_on_stage_change: cancelOnStage,
        is_enabled: isEnabled,
        recurring_cron: trigger === 'recurring' ? buildRecurringCron() : null,
        webhook_token: trigger === 'webhook' ? (webhookToken || null) : null,
        steps: steps.map((s) => ({ action_type: s.action_type, config: s.config })),
      })
      close()
    } catch { /* toast no hook */ }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Nova automação</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cad-name">Nome</Label>
            <Input id="cad-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nutrição pós-cadastro" />
          </div>

          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            A automação para automaticamente se o contato responder ou pedir opt-out.
          </p>

          {/* BLOCO 1 — QUANDO ISSO ACONTECER */}
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quando isso acontecer</Label>
            <Select value={trigger} onValueChange={(v) => pickTrigger(v as TriggerChoice)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>

            {trigger === 'stage_changed' && (
              <div className="space-y-1.5"><Label className="text-xs">Para qual(is) etapa(s)</Label><StageMultiSelect value={stageTargets} onChange={setStageTargets} /></div>
            )}
            {trigger === 'tag_added' && (
              <Input placeholder="Tag que dispara (ex: cliente_vip)" value={tagName} onChange={(e) => setTagName(e.target.value)} />
            )}
            {trigger === 'recurring' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Select value={recFreq} onValueChange={(v) => setRecFreq(v as 'daily' | 'weekly' | 'monthly')}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="time" className="w-32" value={recTime} onChange={(e) => setRecTime(e.target.value)} />
                </div>
                {recFreq === 'weekly' && (
                  <Select value={String(recDow)} onValueChange={(v) => setRecDow(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {recFreq === 'monthly' && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Dia do mês</span>
                    <Input type="number" min={1} max={31} className="w-20" value={String(recDom)} onChange={(e) => setRecDom(Number(e.target.value))} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Horário em BRT. A automação roda nesse agendamento.</p>
              </div>
            )}
            {trigger === 'webhook' && (
              <div className="space-y-1">
                <Label className="text-xs">Token do webhook</Label>
                <Input readOnly value={webhookToken} className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground">POST para a automação usando este token dispara o fluxo.</p>
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Filtro por origem (opcional)</Label>
              <Select value={sourceId || 'all'} onValueChange={(v) => setSourceId(v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todas as origens" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {(leadSources ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* BLOCO 2 — SOMENTE SE */}
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Somente se</Label>
            <div className="space-y-1.5"><Label className="text-xs">Só nestas etapas (opcional)</Label><StageMultiSelect value={onlyStageIds} onChange={setOnlyStageIds} /></div>
            <label className="flex items-center gap-2 pt-1 text-sm">
              <Switch checked={cancelOnStage} onCheckedChange={setCancelOnStage} />
              Cancelar se o contato mudar de etapa
            </label>
          </div>

          {/* BLOCO 3 — ENTÃO FAZER */}
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Então fazer</Label>
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
                  <textarea
                    placeholder="Mensagem (texto livre). Variáveis: {{nome}}, {{telefone}}, {{empresa}}"
                    value={String(s.config.content ?? '')}
                    onChange={(e) => setStepConfig(i, 'content', e.target.value)}
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}
                {s.action_type === 'generate_ai' && (
                  <div className="space-y-1">
                    <Input placeholder="Instrução para a IA (ex: convide o lead pra uma demo)" value={String(s.config.prompt ?? '')} onChange={(e) => setStepConfig(i, 'prompt', e.target.value)} />
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
                    <Input type="number" min={0} placeholder="dias" value={String(s.config.days ?? '')} onChange={(e) => setStepConfig(i, 'days', Number(e.target.value))} />
                    <Input type="number" min={0} placeholder="horas" value={String(s.config.hours ?? '')} onChange={(e) => setStepConfig(i, 'hours', Number(e.target.value))} />
                  </div>
                )}
                {(s.action_type === 'add_tag' || s.action_type === 'remove_tag') && (
                  <Input placeholder="Tag" value={String(s.config.tag ?? '')} onChange={(e) => setStepConfig(i, 'tag', e.target.value)} />
                )}
                {s.action_type === 'change_stage' && (
                  <Input placeholder="ID da etapa (stage_id)" value={String(s.config.stage_id ?? '')} onChange={(e) => setStepConfig(i, 'stage_id', e.target.value)} />
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSteps((p) => [...p, { action_type: 'send_message', config: {} }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar passo
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={!canSave}>Salvar como rascunho</Button>
            <Button onClick={() => save(true)} disabled={!canSave}>
              {createCadence.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar e ativar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
