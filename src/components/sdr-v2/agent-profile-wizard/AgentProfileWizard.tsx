import { useState, useCallback } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { useAuthStore } from '@/stores/auth.store'
import { useCreateAgentProfile, useUpdateAgentProfile } from '@/hooks/use-agent-profile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { StepIdentity } from './steps/StepIdentity'
import { StepCompany } from './steps/StepCompany'
import { StepPurpose } from './steps/StepPurpose'
import { StepBehavior } from './steps/StepBehavior'
import { StepGuardrails } from './steps/StepGuardrails'
import { StepKnowledge } from './steps/StepKnowledge'
import { StepReview } from './steps/StepReview'
import type { AgentProfile, AgentPurpose, BusinessHours, ToolName } from '@/types/sdr-v2'
import { TOOL_PRESETS_BY_PURPOSE, DEFAULT_BUSINESS_HOURS, DEFAULT_FOLLOWUP_CADENCE } from '@/types/sdr-v2'

// --- Types ---

export interface WizardFormData {
  agent_name: string
  agent_gender: 'female' | 'male' | 'neutral'
  tone: 'formal' | 'informal' | 'coloquial' | 'tecnico'
  personality: 'consultiva' | 'objetiva' | 'calorosa' | 'tecnica'
  disclose_ai: boolean
  company_description: string
  value_proposition: string
  differentiators: string
  ideal_customer_profile: string
  purpose: AgentPurpose
  primary_goal: string
  enabled_tools: ToolName[]
  max_iterations_per_turn: number
  max_tokens_per_conversation: number
  max_payment_value_brl: number
  business_hours: BusinessHours
  followup_cadence: number[]
  followup_max_attempts: number
  forbidden_topics: string[]
  must_escalate_keywords: string[]
  custom_guardrails: string
}

interface AgentProfileWizardProps {
  pipelineId: string
  existingProfile?: AgentProfile | null
  onComplete: (profile: AgentProfile) => void
  onCancel: () => void
}

const GUIDED_STEPS = [0, 1, 2, 6] // Identity, Company, Purpose, Review
const ALL_STEPS = [0, 1, 2, 3, 4, 5, 6]

const STEP_LABELS = [
  'Identidade',
  'Empresa',
  'Proposito',
  'Comportamento',
  'Guardrails',
  'Conhecimento',
  'Revisao',
]

// --- Component ---

export const AgentProfileWizard = ({ pipelineId, existingProfile, onComplete, onCancel }: AgentProfileWizardProps) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const [currentStep, setCurrentStep] = useState(0)
  const [isAdvanced, setIsAdvanced] = useState(!!existingProfile)
  const createProfile = useCreateAgentProfile()
  const updateProfile = useUpdateAgentProfile()

  const steps = isAdvanced ? ALL_STEPS : GUIDED_STEPS
  const currentStepIndex = steps.indexOf(currentStep)

  const methods = useForm<WizardFormData>({
    defaultValues: existingProfile
      ? formDataFromProfile(existingProfile)
      : {
          agent_name: '',
          agent_gender: 'neutral',
          tone: 'informal',
          personality: 'consultiva',
          disclose_ai: true,
          company_description: '',
          value_proposition: '',
          differentiators: '',
          ideal_customer_profile: '',
          purpose: 'qualification',
          primary_goal: '',
          enabled_tools: TOOL_PRESETS_BY_PURPOSE.qualification,
          max_iterations_per_turn: 10,
          max_tokens_per_conversation: 50000,
          max_payment_value_brl: 5000,
          business_hours: DEFAULT_BUSINESS_HOURS,
          followup_cadence: DEFAULT_FOLLOWUP_CADENCE,
          followup_max_attempts: 5,
          forbidden_topics: [],
          must_escalate_keywords: [],
          custom_guardrails: '',
        },
  })

  const goNext = useCallback(() => {
    const nextIdx = currentStepIndex + 1
    if (nextIdx < steps.length) setCurrentStep(steps[nextIdx])
  }, [currentStepIndex, steps])

  const goPrev = useCallback(() => {
    const prevIdx = currentStepIndex - 1
    if (prevIdx >= 0) setCurrentStep(steps[prevIdx])
  }, [currentStepIndex, steps])

  const toggleAdvanced = useCallback(() => {
    setIsAdvanced((v) => !v)
  }, [])

  const handleSave = useCallback(async () => {
    const data = methods.getValues()
    if (!companyId) return

    const payload = {
      pipeline_id: pipelineId,
      company_id: companyId,
      agent_name: data.agent_name,
      agent_gender: data.agent_gender,
      tone: data.tone,
      personality: data.personality,
      disclose_ai: data.disclose_ai,
      company_description: data.company_description,
      value_proposition: data.value_proposition,
      differentiators: data.differentiators || null,
      ideal_customer_profile: data.ideal_customer_profile || null,
      purpose: data.purpose,
      primary_goal: data.primary_goal,
      enabled_tools: data.enabled_tools,
      max_iterations_per_turn: data.max_iterations_per_turn,
      max_tokens_per_conversation: data.max_tokens_per_conversation,
      max_payment_value_brl: data.max_payment_value_brl,
      operating_mode: 'full_auto' as const,
      business_hours: data.business_hours,
      followup_cadence: data.followup_cadence,
      followup_max_attempts: data.followup_max_attempts,
      forbidden_topics: data.forbidden_topics,
      must_escalate_keywords: data.must_escalate_keywords,
      custom_guardrails: data.custom_guardrails || null,
      is_active: false,
      created_by: null,
    }

    if (existingProfile) {
      const updated = await updateProfile.mutateAsync({ id: existingProfile.id, data: payload })
      onComplete(updated)
    } else {
      const created = await createProfile.mutateAsync(payload)
      onComplete(created)
    }
  }, [methods, companyId, pipelineId, existingProfile, createProfile, updateProfile, onComplete])

  const isSaving = createProfile.isPending || updateProfile.isPending
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {steps.map((stepIdx, i) => (
              <div key={stepIdx} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentStep(stepIdx)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    stepIdx === currentStep
                      ? 'bg-primary text-primary-foreground'
                      : i < currentStepIndex
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < currentStepIndex ? <Check className="h-4 w-4" /> : i + 1}
                </button>
                <span className={`hidden text-sm sm:inline ${stepIdx === currentStep ? 'font-medium' : 'text-muted-foreground'}`}>
                  {STEP_LABELS[stepIdx]}
                </span>
                {i < steps.length - 1 && <div className="mx-1 h-px w-4 bg-border sm:w-8" />}
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={toggleAdvanced} className="gap-1 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            {isAdvanced ? 'Modo guiado' : 'Avancado'}
          </Button>
        </div>

        {/* Step content */}
        <Card>
          <CardContent className="pt-6">
            {currentStep === 0 && <StepIdentity />}
            {currentStep === 1 && <StepCompany />}
            {currentStep === 2 && <StepPurpose />}
            {currentStep === 3 && <StepBehavior />}
            {currentStep === 4 && <StepGuardrails />}
            {currentStep === 5 && <StepKnowledge agentProfileId={existingProfile?.id} />}
            {currentStep === 6 && <StepReview onSave={handleSave} isSaving={isSaving} agentProfileId={existingProfile?.id} />}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <div>
            {!isFirstStep && (
              <Button variant="outline" onClick={goPrev}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            {!isLastStep && (
              <Button onClick={goNext}>
                Proximo <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </FormProvider>
  )
}

// --- Helpers ---

function formDataFromProfile(p: AgentProfile): WizardFormData {
  return {
    agent_name: p.agent_name,
    agent_gender: p.agent_gender,
    tone: p.tone,
    personality: p.personality,
    disclose_ai: p.disclose_ai,
    company_description: p.company_description,
    value_proposition: p.value_proposition,
    differentiators: p.differentiators ?? '',
    ideal_customer_profile: p.ideal_customer_profile ?? '',
    purpose: p.purpose,
    primary_goal: p.primary_goal,
    enabled_tools: p.enabled_tools,
    max_iterations_per_turn: p.max_iterations_per_turn,
    max_tokens_per_conversation: p.max_tokens_per_conversation,
    max_payment_value_brl: p.max_payment_value_brl,
    business_hours: p.business_hours,
    followup_cadence: p.followup_cadence,
    followup_max_attempts: p.followup_max_attempts,
    forbidden_topics: p.forbidden_topics,
    must_escalate_keywords: p.must_escalate_keywords,
    custom_guardrails: p.custom_guardrails ?? '',
  }
}
