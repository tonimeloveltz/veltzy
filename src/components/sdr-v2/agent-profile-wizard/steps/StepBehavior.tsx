import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import type { WizardFormData } from '../AgentProfileWizard'

const DAY_LABELS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
]

export const StepBehavior = () => {
  const { register, watch, setValue } = useFormContext<WizardFormData>()
  const businessHours = watch('business_hours')
  const cadence = watch('followup_cadence')

  const window = businessHours?.windows?.[0] ?? { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }
  const selectedDays = window.days ?? []

  const toggleDay = (day: number) => {
    const updated = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day].sort()

    setValue('business_hours', {
      timezone: businessHours?.timezone ?? 'America/Sao_Paulo',
      windows: [{ ...window, days: updated }],
    })
  }

  const setTime = (field: 'start' | 'end', value: string) => {
    setValue('business_hours', {
      timezone: businessHours?.timezone ?? 'America/Sao_Paulo',
      windows: [{ ...window, [field]: value }],
    })
  }

  const cadenceLabels = ['1o follow-up', '2o follow-up', '3o follow-up', '4o follow-up', '5o follow-up']

  const setCadenceValue = (index: number, minutes: number) => {
    const updated = [...(cadence ?? [60, 1440, 4320, 10080, 20160])]
    updated[index] = minutes
    setValue('followup_cadence', updated)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Comportamento e limites</h3>
        <p className="text-sm text-muted-foreground">Horario de funcionamento, cadencia de follow-up e limites tecnicos.</p>
      </div>

      {/* Horario comercial */}
      <div className="space-y-3">
        <Label>Horario comercial</Label>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedDays.includes(d.value)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            value={window.start}
            onChange={(e) => setTime('start', e.target.value)}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">ate</span>
          <Input
            type="time"
            value={window.end}
            onChange={(e) => setTime('end', e.target.value)}
            className="w-32"
          />
        </div>
      </div>

      {/* Cadencia de follow-up */}
      <div className="space-y-3">
        <Label>Cadencia de follow-up (em minutos)</Label>
        <p className="text-xs text-muted-foreground">Intervalos entre follow-ups quando lead nao responde.</p>
        <div className="grid gap-2 sm:grid-cols-5">
          {cadenceLabels.map((label, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                min={15}
                value={cadence?.[i] ?? 0}
                onChange={(e) => setCadenceValue(i, parseInt(e.target.value) || 0)}
              />
              <span className="text-xs text-muted-foreground">
                {formatMinutes(cadence?.[i] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Limites */}
      <div className="space-y-3">
        <Label>Limites tecnicos</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Max iteracoes por turno</Label>
            <Input type="number" min={1} max={15} {...register('max_iterations_per_turn', { valueAsNumber: true })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max tokens por conversa</Label>
            <Input type="number" min={1000} {...register('max_tokens_per_conversation', { valueAsNumber: true })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max follow-ups</Label>
            <Input type="number" min={1} max={20} {...register('followup_max_attempts', { valueAsNumber: true })} />
          </div>
        </div>
      </div>
    </div>
  )
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}min`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}
