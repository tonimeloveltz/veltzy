import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import type { WizardFormData } from '../AgentProfileWizard'
import type { AgentPurpose, ToolName } from '@/types/sdr-v2'
import { TOOL_PRESETS_BY_PURPOSE } from '@/types/sdr-v2'

const PURPOSE_OPTIONS = [
  { value: 'qualification', label: 'Qualificacao de leads', desc: 'Identifica e classifica leads por potencial' },
  { value: 'appointment_booking', label: 'Agendamento de reunioes', desc: 'Agenda reunioes comerciais com leads qualificados' },
  { value: 'direct_sales', label: 'Venda direta', desc: 'Conduz venda e gera cobranca' },
  { value: 'support', label: 'Suporte', desc: 'Atendimento e resolucao de duvidas' },
  { value: 'recovery', label: 'Recuperacao', desc: 'Reativa clientes inativos ou inadimplentes' },
]

const TOOL_LABELS: Record<string, string> = {
  qualify_lead: 'Qualificar lead (score + temperatura)',
  update_lead_field: 'Atualizar dados do lead',
  escalate_to_human: 'Escalar para vendedor humano',
  query_business_knowledge: 'Consultar base de conhecimento',
  schedule_meeting: 'Agendar reuniao (Onda 2)',
  send_payment_link: 'Enviar link de pagamento (Onda 2)',
  schedule_followup: 'Agendar follow-up (Onda 3)',
  end_conversation: 'Encerrar conversa (Onda 3)',
}

const AVAILABLE_TOOLS: ToolName[] = ['qualify_lead', 'update_lead_field', 'escalate_to_human', 'query_business_knowledge']

export const StepPurpose = () => {
  const { register, watch, setValue } = useFormContext<WizardFormData>()
  const purpose = watch('purpose')
  const enabledTools = watch('enabled_tools')

  const handlePurposeChange = (value: string) => {
    const p = value as AgentPurpose
    setValue('purpose', p)
    setValue('enabled_tools', TOOL_PRESETS_BY_PURPOSE[p])
  }

  const handleToolToggle = (tool: ToolName, checked: boolean) => {
    const current = enabledTools ?? []
    const updated = checked ? [...current, tool] : current.filter((t) => t !== tool)
    setValue('enabled_tools', updated)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Proposito e habilidades</h3>
        <p className="text-sm text-muted-foreground">O que seu agente faz e quais acoes pode executar.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Proposito principal</Label>
          <Select value={purpose} onValueChange={handlePurposeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PURPOSE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span>{o.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{o.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="primary_goal">Objetivo principal (texto livre)</Label>
          <Input
            id="primary_goal"
            placeholder="Ex: Qualificar leads interessados e conectar com vendedor quando prontos"
            {...register('primary_goal', { required: true })}
          />
        </div>

        <div className="space-y-3">
          <Label>Tools habilitadas</Label>
          <p className="text-xs text-muted-foreground">
            Pre-selecionadas pelo proposito. Voce pode ajustar manualmente.
          </p>
          <div className="space-y-2">
            {AVAILABLE_TOOLS.map((tool) => (
              <div key={tool} className="flex items-center gap-2">
                <Checkbox
                  id={`tool-${tool}`}
                  checked={enabledTools?.includes(tool) ?? false}
                  onCheckedChange={(checked) => handleToolToggle(tool, !!checked)}
                />
                <Label htmlFor={`tool-${tool}`} className="cursor-pointer text-sm font-normal">
                  {TOOL_LABELS[tool] ?? tool}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
