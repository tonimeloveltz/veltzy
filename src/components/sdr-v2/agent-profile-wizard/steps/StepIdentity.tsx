import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { WizardFormData } from '../AgentProfileWizard'

const TONE_OPTIONS = [
  { value: 'formal', label: 'Formal e profissional' },
  { value: 'informal', label: 'Informal e acessivel' },
  { value: 'coloquial', label: 'Coloquial e descontraido' },
  { value: 'tecnico', label: 'Tecnico e preciso' },
]

const PERSONALITY_OPTIONS = [
  { value: 'consultiva', label: 'Consultiva (entende antes de propor)' },
  { value: 'objetiva', label: 'Objetiva (direto ao ponto)' },
  { value: 'calorosa', label: 'Calorosa (cria conexao pessoal)' },
  { value: 'tecnica', label: 'Tecnica (foco em dados)' },
]

const GENDER_OPTIONS = [
  { value: 'female', label: 'Feminino' },
  { value: 'male', label: 'Masculino' },
  { value: 'neutral', label: 'Neutro' },
]

export const StepIdentity = () => {
  const { register, watch, setValue } = useFormContext<WizardFormData>()
  const tone = watch('tone')
  const personality = watch('personality')
  const gender = watch('agent_gender')
  const discloseAi = watch('disclose_ai')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Identidade do agente</h3>
        <p className="text-sm text-muted-foreground">Como seu agente SDR vai se apresentar aos leads.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agent_name">Nome do agente</Label>
          <Input id="agent_name" placeholder="Ex: Lara, Carlos, SDR Veltz" {...register('agent_name', { required: true })} />
        </div>

        <div className="space-y-2">
          <Label>Genero</Label>
          <Select value={gender} onValueChange={(v) => setValue('agent_gender', v as WizardFormData['agent_gender'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tom de voz</Label>
          <Select value={tone} onValueChange={(v) => setValue('tone', v as WizardFormData['tone'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Personalidade</Label>
          <Select value={personality} onValueChange={(v) => setValue('personality', v as WizardFormData['personality'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERSONALITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="disclose_ai" checked={discloseAi} onCheckedChange={(v) => setValue('disclose_ai', v)} />
        <Label htmlFor="disclose_ai" className="cursor-pointer">
          Revelar que e IA se perguntado
        </Label>
      </div>
    </div>
  )
}
