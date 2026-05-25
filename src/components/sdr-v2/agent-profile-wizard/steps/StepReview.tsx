import { useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Play } from 'lucide-react'
import type { WizardFormData } from '../AgentProfileWizard'

const TONE_LABELS: Record<string, string> = {
  formal: 'Formal', informal: 'Informal', coloquial: 'Coloquial', tecnico: 'Tecnico',
}
const PERSONALITY_LABELS: Record<string, string> = {
  consultiva: 'Consultiva', objetiva: 'Objetiva', calorosa: 'Calorosa', tecnica: 'Tecnica',
}
const PURPOSE_LABELS: Record<string, string> = {
  qualification: 'Qualificacao', appointment_booking: 'Agendamento', direct_sales: 'Venda direta',
  support: 'Suporte', recovery: 'Recuperacao',
}
const TOOL_LABELS: Record<string, string> = {
  qualify_lead: 'Qualificar lead', update_lead_field: 'Atualizar dados',
  escalate_to_human: 'Escalar p/ humano', query_business_knowledge: 'Consultar KB',
}

interface StepReviewProps {
  onSave: () => Promise<void>
  isSaving: boolean
  agentProfileId?: string
}

export const StepReview = ({ onSave, isSaving, agentProfileId }: StepReviewProps) => {
  const { watch } = useFormContext<WizardFormData>()
  const data = watch()

  const requiredMissing: string[] = []
  if (!data.agent_name) requiredMissing.push('Nome do agente')
  if (!data.company_description) requiredMissing.push('Descricao da empresa')
  if (!data.value_proposition) requiredMissing.push('Proposta de valor')
  if (!data.primary_goal) requiredMissing.push('Objetivo principal')

  const bhWindow = data.business_hours?.windows?.[0]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Revisao do Agent Profile</h3>
        <p className="text-sm text-muted-foreground">Confira as configuracoes antes de salvar.</p>
      </div>

      {requiredMissing.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Campos obrigatorios faltando: {requiredMissing.join(', ')}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Identidade */}
        <Section title="Identidade">
          <Row label="Nome" value={data.agent_name || '-'} />
          <Row label="Tom" value={TONE_LABELS[data.tone] ?? data.tone} />
          <Row label="Personalidade" value={PERSONALITY_LABELS[data.personality] ?? data.personality} />
          <Row label="Revela IA" value={data.disclose_ai ? 'Sim' : 'Nao'} />
        </Section>

        {/* Proposito */}
        <Section title="Proposito">
          <Row label="Tipo" value={PURPOSE_LABELS[data.purpose] ?? data.purpose} />
          <Row label="Objetivo" value={data.primary_goal || '-'} />
          <Row label="Tools" value={(data.enabled_tools ?? []).map((t) => TOOL_LABELS[t] ?? t).join(', ') || '-'} />
        </Section>

        {/* Empresa */}
        <Section title="Empresa">
          <Row label="Descricao" value={truncate(data.company_description, 80) || '-'} />
          <Row label="Proposta" value={truncate(data.value_proposition, 80) || '-'} />
        </Section>

        {/* Comportamento */}
        <Section title="Comportamento">
          <Row
            label="Horario"
            value={bhWindow ? `${bhWindow.start}-${bhWindow.end} (${bhWindow.days?.length ?? 0} dias)` : 'Nao configurado'}
          />
          <Row label="Max iteracoes" value={String(data.max_iterations_per_turn)} />
          <Row label="Max tokens" value={String(data.max_tokens_per_conversation)} />
        </Section>
      </div>

      {/* Guardrails summary */}
      {(data.forbidden_topics?.length > 0 || data.must_escalate_keywords?.length > 0) && (
        <Section title="Guardrails">
          {data.forbidden_topics?.length > 0 && (
            <Row label="Proibidos" value={data.forbidden_topics.join(', ')} />
          )}
          {data.must_escalate_keywords?.length > 0 && (
            <Row label="Escalada" value={data.must_escalate_keywords.join(', ')} />
          )}
        </Section>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          onClick={onSave}
          disabled={isSaving || requiredMissing.length > 0}
          className="gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {agentProfileId ? 'Salvar alteracoes' : 'Criar Agent Profile'}
        </Button>
      </div>
    </div>
  )
}

// --- UI helpers ---

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Label>
    <div className="space-y-1">{children}</div>
  </div>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="max-w-[60%] text-right">{value}</span>
  </div>
)

function truncate(s: string, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '...' : s
}
