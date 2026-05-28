import { useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import type { WizardFormData } from '../AgentProfileWizard'

export const StepCompany = () => {
  const { register } = useFormContext<WizardFormData>()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Contexto da empresa</h3>
        <p className="text-sm text-muted-foreground">Informacoes que o agente usara para entender e representar sua empresa.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company_description">Descricao da empresa (2-3 frases)</Label>
          <textarea
            id="company_description"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex: Empresa de tecnologia que desenvolve CRM para PMEs brasileiras..."
            {...register('company_description', { required: true })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="value_proposition">Proposta de valor (1-2 frases)</Label>
          <textarea
            id="value_proposition"
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex: CRM com IA SDR integrada para vendas via WhatsApp..."
            {...register('value_proposition', { required: true })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="differentiators">Diferenciais (opcional)</Label>
          <textarea
            id="differentiators"
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex: Unico CRM com SDR IA em portugues, integracao nativa WhatsApp..."
            {...register('differentiators')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ideal_customer_profile">Perfil de cliente ideal (opcional)</Label>
          <textarea
            id="ideal_customer_profile"
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex: PMEs com 5-50 funcionarios, faturamento R$500k-5M, equipe comercial de 2-10..."
            {...register('ideal_customer_profile')}
          />
        </div>
      </div>
    </div>
  )
}
