import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { RegistrationFieldInput } from '@/components/events/public/registration-field-input'
import { errorText, type FormFieldSpec, type RegistrationValues } from '@/lib/events/registration-form'

interface RegistrationFormFieldsProps {
  fields: FormFieldSpec[]
  values: RegistrationValues
  errors: Record<string, string>
  onChange: (next: RegistrationValues) => void
}

type FixedKey = 'first_name' | 'last_name' | 'email' | 'whatsapp'

/** Campos do formulario de inscricao, na ordem do evento. Compartilhado: inscricao manual e pagina publica. */
export const RegistrationFormFields = ({ fields, values, errors, onChange }: RegistrationFormFieldsProps) => {
  const setFixed = (key: FixedKey, v: string) => onChange({ ...values, [key]: v })
  const setAnswer = (id: string, v: unknown) => onChange({ ...values, answers: { ...values.answers, [id]: v } })

  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const isFixed = f.kind === 'fixed' && f.key !== null
        const errKey = isFixed ? f.key! : f.id
        const err = errorText(errors[errKey])
        const id = isFixed ? `fx-${f.key}` : `f-${f.id}`
        const required = f.required || f.type === 'terms'
        return (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={id} id={`${id}-label`}>
              {f.label}{required && <span className="text-destructive"> *</span>}
            </Label>
            {isFixed ? (
              f.key === 'whatsapp' ? (
                <PhoneInput id={id} value={values.whatsapp} onChange={(v) => setFixed('whatsapp', v)}
                  className={err ? 'border-destructive' : undefined} />
              ) : (
                <Input id={id} type={f.key === 'email' ? 'email' : 'text'} maxLength={f.key === 'email' ? 254 : 120}
                  className={err ? 'border-destructive' : undefined}
                  value={values[f.key as FixedKey]} onChange={(e) => setFixed(f.key as FixedKey, e.target.value)} />
              )
            ) : (
              <RegistrationFieldInput field={f} value={values.answers[f.id]} invalid={!!err} onChange={(v) => setAnswer(f.id, v)} />
            )}
            {f.help_text && <p className="text-xs opacity-70">{f.help_text}</p>}
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        )
      })}
    </div>
  )
}
