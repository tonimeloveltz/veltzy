import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EditorField } from '@/components/events/editor/editor-field'
import { EditorSection } from '@/components/events/editor/editor-section'
import type { EditorValues } from '@/lib/events/editor-form'

interface ScheduleSectionProps {
  timezone: string
}

const tzLabel = (tz: string) => (tz === 'America/Sao_Paulo' ? 'horário de Brasília' : tz)

export const ScheduleSection = ({ timezone }: ScheduleSectionProps) => {
  const { register, control, formState: { errors } } = useFormContext<EditorValues>()
  const unlimited = useWatch({ control, name: 'unlimited' })

  return (
    <EditorSection title="Data, inscrições e vagas" description={`Datas no ${tzLabel(timezone)}.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <EditorField label="Início" htmlFor="starts_at" error={errors.starts_at?.message}>
          <Input id="starts_at" type="datetime-local" {...register('starts_at')} />
        </EditorField>
        <EditorField label="Fim" htmlFor="ends_at" error={errors.ends_at?.message}>
          <Input id="ends_at" type="datetime-local" {...register('ends_at')} />
        </EditorField>
        <EditorField label="Inscrições abrem" htmlFor="registration_opens_at" optional
          hint="Vazio: abrem assim que o evento for publicado.">
          <Input id="registration_opens_at" type="datetime-local" {...register('registration_opens_at')} />
        </EditorField>
        <EditorField label="Inscrições fecham" htmlFor="registration_closes_at" optional
          error={errors.registration_closes_at?.message} hint="Vazio: fecham no início do evento.">
          <Input id="registration_closes_at" type="datetime-local" {...register('registration_closes_at')} />
        </EditorField>
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center gap-3">
          <Controller control={control} name="unlimited" render={({ field }) => (
            <Switch id="unlimited" checked={field.value} onCheckedChange={field.onChange} />
          )} />
          <Label htmlFor="unlimited">Vagas ilimitadas</Label>
        </div>
        {!unlimited && (
          <div className="grid gap-4 sm:grid-cols-2">
            <EditorField label="Número de vagas" htmlFor="capacity" error={errors.capacity?.message}>
              <Input id="capacity" type="number" min={1} inputMode="numeric" {...register('capacity')} />
            </EditorField>
            <div className="flex items-center gap-3 sm:pt-7">
              <Controller control={control} name="show_remaining_spots" render={({ field }) => (
                <Switch id="show_remaining_spots" checked={field.value} onCheckedChange={field.onChange} />
              )} />
              <Label htmlFor="show_remaining_spots">Mostrar vagas restantes na página</Label>
            </div>
          </div>
        )}
      </div>
    </EditorSection>
  )
}
